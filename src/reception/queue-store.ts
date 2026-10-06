import { QUEUE_MOCK } from "./queue-data";
import type { Priority, QueuePatient } from "./types";
import type { Role } from "../auth/types";

export interface PriorityAuditEntry {
  id: string;
  patient: string;
  ticket: string;
  previousPriority: Priority;
  newPriority: Priority;
  reason: string;
  responsible: string;
  occurredAt: string;
  status: "ativa" | "desfeita" | "excluída" | "restaurada";
  type: "priority-change" | "Desfeita" | "exclusão" | "Exclusão desfeita";
  originalEntryId?: string;
  alertStatus?: "active" | "cancelled";
  deletionReason?: "Cadastro duplicado" | "Cadastro por engano" | "Paciente desistiu / evadiu" | "Outro";
}

export interface QueueSnapshot {
  patients: QueuePatient[];
  auditEntries: PriorityAuditEntry[];
  revision: number;
  patientVersions: Record<string, number>;
}

export interface QueueMutationResult {
  ok: boolean;
  reason?: "unauthorized" | "patient-unavailable" | "unchanged-priority" | "invalid-reason" | "stale" | "undo-blocked" | "invalid-deletion-reason";
  snapshot: QueueSnapshot;
  entry?: PriorityAuditEntry;
}

const CHANNEL_NAME = "agora-voce.queue-updates";
const listeners = new Set<() => void>();

const createInitialSnapshot = (): QueueSnapshot => ({
  patients: QUEUE_MOCK.map((patient) => ({ ...patient, vitals: { ...patient.vitals } })),
  auditEntries: [],
  revision: 0,
  patientVersions: Object.fromEntries(QUEUE_MOCK.map((patient) => [patient.ticket, 0])),
});

let snapshot = createInitialSnapshot();
const channel = typeof BroadcastChannel === "undefined"
  ? null
  : new BroadcastChannel(CHANNEL_NAME);

const notify = () => {
  for (const listener of listeners) listener();
};

const receiveSnapshot = (value: unknown) => {
  if (!value || typeof value !== "object") return;
  const incoming = value as Partial<QueueSnapshot>;
  if (!Array.isArray(incoming.patients) || !Array.isArray(incoming.auditEntries) || !incoming.patientVersions) return;
  snapshot = incoming as QueueSnapshot;
  notify();
};

channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
  receiveSnapshot(event.data);
});

export const getQueueSnapshot = () => snapshot;

export const subscribeQueue = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const publishSnapshot = (nextSnapshot: QueueSnapshot) => {
  snapshot = nextSnapshot;
  channel?.postMessage(snapshot);
  notify();
};

export const getUndoEntry = (ticket: string, now = Date.now()) => {
  const patient = snapshot.patients.find((item) => item.ticket === ticket);
  if (!patient || patient.status !== "waiting") return null;
  const latest = [...snapshot.auditEntries].reverse().find((entry) => entry.ticket === ticket);
  if (!latest || latest.type !== "priority-change" || latest.status !== "ativa") return null;
  if (Date.parse(latest.occurredAt) + 10 * 60_000 < now) return null;
  if (patient.priority !== latest.newPriority) return null;
  return latest;
};

export const getUndoBlockedReason = (ticket: string, now = Date.now(), requestedEntryId?: string) => {
  const patient = snapshot.patients.find((item) => item.ticket === ticket);
  if (patient && patient.status !== "waiting") return "Paciente já foi chamado ou está em atendimento.";
  const latest = [...snapshot.auditEntries].reverse().find((entry) => entry.ticket === ticket);
  if (latest?.type === "Desfeita") return "Esta alteração já foi desfeita.";
  if (requestedEntryId && latest?.type === "priority-change" && latest.id !== requestedEntryId) {
    return "Outra alteração foi feita depois da original.";
  }
  if (latest?.type === "priority-change" && latest.status === "ativa" && Date.parse(latest.occurredAt) + 10 * 60_000 < now) {
    return "O prazo de 10 minutos para desfazer expirou.";
  }
  if (latest?.type === "priority-change" && latest.status === "ativa" && patient?.priority !== latest.newPriority) {
    return "Outra alteração foi feita depois desta.";
  }
  return "Não há alteração recente disponível para desfazer.";
};

export const changePriority = (
  ticket: string,
  priority: Priority,
  input: Omit<PriorityAuditEntry, "id" | "ticket" | "status" | "type" | "alertStatus">,
  role: Role,
  expectedPatientVersion: number,
): QueueMutationResult => {
  if (!["RECEPCIONISTA", "MEDICO", "ADMIN"].includes(role)) return { ok: false, reason: "unauthorized", snapshot };
  if ((snapshot.patientVersions[ticket] ?? 0) !== expectedPatientVersion) return { ok: false, reason: "stale", snapshot };
  const patient = snapshot.patients.find((item) => item.ticket === ticket);
  if (!patient || patient.status !== "waiting") return { ok: false, reason: "patient-unavailable", snapshot };
  if (priority === patient.priority) return { ok: false, reason: "unchanged-priority", snapshot };
  if (input.reason.trim().length < 10) return { ok: false, reason: "invalid-reason", snapshot };

  const entry: PriorityAuditEntry = {
    ...input,
    id: crypto.randomUUID(),
    ticket,
    status: "ativa",
    type: "priority-change",
    ...(priority === "urgent" ? { alertStatus: "active" as const } : {}),
  };
  const nextSnapshot: QueueSnapshot = {
    patients: snapshot.patients.map((item) => item.ticket === ticket ? { ...item, priority } : item),
    auditEntries: [...snapshot.auditEntries, entry],
    revision: snapshot.revision + 1,
    patientVersions: { ...snapshot.patientVersions, [ticket]: expectedPatientVersion + 1 },
  };
  publishSnapshot(nextSnapshot);
  return { ok: true, snapshot, entry };
};

export const undoPriorityChange = (
  ticket: string,
  responsible: string,
  role: Role,
  originalEntryId: string,
  expectedPatientVersion: number,
  now = new Date(),
): QueueMutationResult => {
  if (!["RECEPCIONISTA", "MEDICO", "ADMIN"].includes(role)) return { ok: false, reason: "unauthorized", snapshot };
  if ((snapshot.patientVersions[ticket] ?? 0) !== expectedPatientVersion) return { ok: false, reason: "stale", snapshot };
  const original = getUndoEntry(ticket, now.getTime());
  if (!original || original.id !== originalEntryId) return { ok: false, reason: "undo-blocked", snapshot };
  const patient = snapshot.patients.find((item) => item.ticket === ticket);
  if (!patient) return { ok: false, reason: "patient-unavailable", snapshot };

  const undoneAt = now.toISOString();
  const undoEntry: PriorityAuditEntry = {
    id: crypto.randomUUID(),
    patient: patient.name,
    ticket,
    previousPriority: patient.priority,
    newPriority: original.previousPriority,
    reason: "Desfeita pelo responsável.",
    responsible,
    occurredAt: undoneAt,
    status: "ativa",
    type: "Desfeita",
    originalEntryId: original.id,
  };
  const auditEntries = snapshot.auditEntries.map((entry) => entry.id === original.id
    ? { ...entry, status: "desfeita" as const, alertStatus: entry.alertStatus === "active" ? "cancelled" as const : entry.alertStatus }
    : entry);
  const nextSnapshot: QueueSnapshot = {
    patients: snapshot.patients.map((item) => item.ticket === ticket ? { ...item, priority: original.previousPriority } : item),
    auditEntries: [...auditEntries, undoEntry],
    revision: snapshot.revision + 1,
    patientVersions: { ...snapshot.patientVersions, [ticket]: expectedPatientVersion + 1 },
  };
  publishSnapshot(nextSnapshot);
  return { ok: true, snapshot, entry: undoEntry };
};

export const deletePatient = (
  ticket: string,
  deletionReason: NonNullable<PriorityAuditEntry["deletionReason"]>,
  description: string,
  responsible: string,
  role: Role,
  expectedPatientVersion: number,
  now = new Date(),
): QueueMutationResult => {
  if (role !== "RECEPCIONISTA" && role !== "ADMIN") return { ok: false, reason: "unauthorized", snapshot };
  if ((snapshot.patientVersions[ticket] ?? 0) !== expectedPatientVersion) return { ok: false, reason: "stale", snapshot };
  const patient = snapshot.patients.find((item) => item.ticket === ticket);
  if (!patient || patient.status !== "waiting") return { ok: false, reason: "patient-unavailable", snapshot };
  if (deletionReason === "Outro" && description.trim().length < 10) return { ok: false, reason: "invalid-deletion-reason", snapshot };

  const entry: PriorityAuditEntry = {
    id: crypto.randomUUID(),
    patient: patient.name,
    ticket,
    previousPriority: patient.priority,
    newPriority: patient.priority,
    reason: deletionReason === "Outro" ? description.trim() : deletionReason,
    responsible,
    occurredAt: now.toISOString(),
    status: "excluída",
    type: "exclusão",
    deletionReason,
    ...(patient.priority === "urgent" && snapshot.auditEntries.some((audit) => audit.ticket === ticket && audit.alertStatus === "active")
      ? { alertStatus: "active" as const }
      : {}),
  };
  const nextSnapshot: QueueSnapshot = {
    patients: snapshot.patients.map((item) => item.ticket === ticket ? { ...item, status: "deleted" } : item),
    auditEntries: [...snapshot.auditEntries, entry],
    revision: snapshot.revision + 1,
    patientVersions: { ...snapshot.patientVersions, [ticket]: expectedPatientVersion + 1 },
  };
  publishSnapshot(nextSnapshot);
  return { ok: true, snapshot, entry };
};

export const getDeletionUndoEntry = (ticket: string, now = Date.now()) => {
  const patient = snapshot.patients.find((item) => item.ticket === ticket);
  if (!patient || patient.status !== "deleted") return null;
  const latest = [...snapshot.auditEntries].reverse().find((entry) => entry.ticket === ticket);
  if (!latest || latest.type !== "exclusão" || latest.status !== "excluída") return null;
  if (Date.parse(latest.occurredAt) + 15_000 < now) return null;
  return latest;
};

export const undoPatientDeletion = (
  ticket: string,
  entryId: string,
  responsible: string,
  role: Role,
  expectedPatientVersion: number,
  now = new Date(),
): QueueMutationResult => {
  if (role !== "RECEPCIONISTA" && role !== "ADMIN") return { ok: false, reason: "unauthorized", snapshot };
  if ((snapshot.patientVersions[ticket] ?? 0) !== expectedPatientVersion) return { ok: false, reason: "stale", snapshot };
  const original = getDeletionUndoEntry(ticket, now.getTime());
  if (!original || original.id !== entryId) return { ok: false, reason: "undo-blocked", snapshot };
  const patient = snapshot.patients.find((item) => item.ticket === ticket);
  if (!patient || patient.status !== "deleted") return { ok: false, reason: "patient-unavailable", snapshot };

  const undoEntry: PriorityAuditEntry = {
    id: crypto.randomUUID(),
    patient: patient.name,
    ticket,
    previousPriority: patient.priority,
    newPriority: patient.priority,
    reason: "Exclusão desfeita.",
    responsible,
    occurredAt: now.toISOString(),
    status: "ativa",
    type: "Exclusão desfeita",
    originalEntryId: original.id,
  };
  const auditEntries = snapshot.auditEntries.map((entry) => entry.id === original.id
    ? { ...entry, status: "desfeita" as const, alertStatus: entry.alertStatus === "active" ? "cancelled" as const : entry.alertStatus }
    : entry);
  const nextSnapshot: QueueSnapshot = {
    patients: snapshot.patients.map((item) => item.ticket === ticket ? { ...item, status: "waiting" } : item),
    auditEntries: [...auditEntries, undoEntry],
    revision: snapshot.revision + 1,
    patientVersions: { ...snapshot.patientVersions, [ticket]: expectedPatientVersion + 1 },
  };
  publishSnapshot(nextSnapshot);
  return { ok: true, snapshot, entry: undoEntry };
};
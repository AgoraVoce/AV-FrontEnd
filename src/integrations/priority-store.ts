import { useSyncExternalStore } from "react";
import type { User } from "../auth/types";
import { operations, type Severity } from "./operational-api";

export const PRIORITY_LEVELS = [
  { level: "VERDE", label: "Tranquilo", color: "Verde", tone: "calm", rank: 2 },
  {
    level: "AMARELO",
    label: "Alerta",
    color: "Amarelo",
    tone: "alert",
    rank: 1,
  },
  {
    level: "VERMELHO",
    label: "Urgente",
    color: "Vermelho",
    tone: "urgent",
    rank: 0,
  },
] as const;
export const priorityInfo = (level?: Severity | null) =>
  PRIORITY_LEVELS.find((item) => item.level === level);
export type PriorityAudit = {
  id: string;
  entryId: string;
  patientId: string;
  previousLevel: Severity | null;
  newLevel: Severity;
  reason: string;
  responsible: Pick<User, "id" | "name" | "role">;
  occurredAt: string;
};
type Snapshot = { records: PriorityAudit[] };
const EMPTY: Snapshot = { records: [] };
const PREFIX = "av:reception-reassessments:v1:";
const cache = new Map<string, { raw: string | null; snapshot: Snapshot }>();
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((listener) => listener());
}
function read(userId: string): Snapshot {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PREFIX + userId);
  } catch {
    return EMPTY;
  }
  const existing = cache.get(userId);
  if (existing?.raw === raw) return existing.snapshot;
  let snapshot = EMPTY;
  try {
    const parsed = JSON.parse(raw || "null") as Snapshot | null;
    if (
      parsed &&
      Array.isArray(parsed.records) &&
      parsed.records.every(
        (record) =>
          typeof record.id === "string" &&
          typeof record.entryId === "string" &&
          typeof record.patientId === "string" &&
          priorityInfo(record.newLevel) &&
          typeof record.reason === "string" &&
          typeof record.occurredAt === "string" &&
          record.responsible?.id === userId,
      )
    )
      snapshot = parsed;
  } catch {
    /* Ignore damaged local data. */
  }
  cache.set(userId, { raw, snapshot });
  return snapshot;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFIX)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
export function usePatientPriorities(userId: string) {
  return useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => EMPTY,
  );
}
export function latestPriority(records: PriorityAudit[], entryId: string) {
  for (let index = records.length - 1; index >= 0; index--) {
    if (records[index].entryId === entryId) return records[index].newLevel;
  }
  return undefined;
}

export async function updatePatientPriority(
  patientId: string,
  input: {
    entryId: string;
    level: Severity;
    reason: string;
    previousLevel: Severity | null;
    responsible: User;
    signal?: AbortSignal;
  },
) {
  const reason = input.reason.trim();
  if (!priorityInfo(input.level) || reason.length < 10 || reason.length > 300)
    throw new Error(
      "Informe um nível e uma justificativa de 10 a 300 caracteres.",
    );
  // Revalidate the live entry before committing a local clinical override.
  const current = await operations.entry(input.entryId, input.signal);
  input.signal?.throwIfAborted();
  if (current.patientId !== patientId || current.status !== "waiting")
    throw new Error(
      "O paciente não está mais aguardando atendimento. A alteração não foi salva.",
    );
  const snapshot = read(input.responsible.id);
  const previousLevel =
    latestPriority(snapshot.records, input.entryId) ?? current.severity ?? null;
  if (previousLevel !== input.previousLevel)
    throw new Error(
      "A classificação mudou durante a edição. Feche e abra a reavaliação novamente.",
    );
  if (previousLevel === input.level)
    throw new Error("Escolha um nível diferente do atual.");
  const record: PriorityAudit = {
    id: crypto.randomUUID(),
    entryId: input.entryId,
    patientId,
    previousLevel,
    newLevel: input.level,
    reason,
    responsible: {
      id: input.responsible.id,
      name: input.responsible.name,
      role: input.responsible.role,
    },
    occurredAt: new Date().toISOString(),
  };
  // TODO: Replace this local fallback with POST /entries/:entryId/reassessments when exposed.
  // The backend must atomically save severity and audit, deriving author/time from the session/server.
  // Entry ID scopes an override to one attendance, so a later visit never inherits an old priority.
  try {
    localStorage.setItem(
      PREFIX + input.responsible.id,
      JSON.stringify({ records: [...snapshot.records, record] }),
    );
  } catch {
    throw new Error(
      "Não foi possível persistir a reavaliação neste navegador. Libere o armazenamento e tente novamente.",
    );
  }
  notify();
  return record;
}

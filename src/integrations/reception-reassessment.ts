import { ApiError, request } from "./client";
import {
  operations,
  type EntryDetail,
  type Page,
  type Severity,
} from "./operational-api";
import { priorityInfo } from "./priority-store";

export type Reassessment = {
  id: string;
  entryId: string;
  occurredAt: string;
  createdAt: string;
  previousSeverity: Severity;
  newSeverity: Severity;
  symptomsSnapshot: {
    symptoms: { id: string; name: string }[];
    otherSymptoms: string | null;
  };
  observationSnapshot: string | null;
  justification?: string | null;
  createdByUserId: string;
};
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const date = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
function parseReassessment(value: unknown): Reassessment {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    typeof value.entryId !== "string" ||
    !date(value.occurredAt) ||
    !date(value.createdAt) ||
    !priorityInfo(value.previousSeverity as Severity) ||
    !priorityInfo(value.newSeverity as Severity) ||
    typeof value.createdByUserId !== "string" ||
    !(
      value.observationSnapshot === null ||
      typeof value.observationSnapshot === "string"
    ) ||
    !(
      value.justification === undefined ||
      value.justification === null ||
      typeof value.justification === "string"
    ) ||
    !object(value.symptomsSnapshot) ||
    !(
      value.symptomsSnapshot.otherSymptoms === null ||
      typeof value.symptomsSnapshot.otherSymptoms === "string"
    ) ||
    !Array.isArray(value.symptomsSnapshot.symptoms) ||
    !value.symptomsSnapshot.symptoms.every(
      (item) =>
        object(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string",
    )
  ) {
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "A confirmação da reavaliação veio em formato inválido. Atualize os dados antes de tentar novamente.",
    );
  }
  return value as Reassessment;
}
const equalIds = (a: string[], b: string[]) =>
  [...a].sort().join("|") === [...b].sort().join("|");
export async function updatePatientPriority(
  patientId: string,
  input: {
    entryId: string;
    contract: "expanded" | "legacy";
    level: Severity;
    reason: string;
    previous: EntryDetail;
    symptomIds: string[];
    otherSymptoms: string;
    signal?: AbortSignal;
  },
): Promise<{ audit: Reassessment; detail: EntryDetail; complaint: string }> {
  const reason = input.reason.trim();
  const complaint = input.otherSymptoms.trim();
  if (!priorityInfo(input.level) || reason.length < 10 || reason.length > 300)
    throw new Error(
      "Informe uma gravidade e uma justificativa de 10 a 300 caracteres.",
    );
  if (complaint.length > 2000 || (!input.symptomIds.length && !complaint))
    throw new Error("Informe os sintomas ou a queixa do paciente.");
  // Re-read immediately before POST. The server enforces waiting state and writes audit atomically.
  const current = await operations.entry(input.entryId, input.signal);
  input.signal?.throwIfAborted();
  if (current.patientId !== patientId || current.status !== "waiting")
    throw new Error(
      "Este paciente não está mais aguardando atendimento. A reavaliação não foi enviada.",
    );
  if (
    !Array.isArray(current.symptomIds) ||
    !Array.isArray(input.previous.symptomIds)
  )
    throw new Error(
      "Não foi possível verificar os sintomas registrados. Feche e abra a reavaliação novamente.",
    );
  if (
    current.severity !== input.previous.severity ||
    !equalIds(current.symptomIds, input.previous.symptomIds) ||
    current.otherSymptoms !== input.previous.otherSymptoms ||
    (current.updatedAt &&
      input.previous.updatedAt &&
      current.updatedAt !== input.previous.updatedAt)
  )
    throw new Error(
      "O atendimento mudou durante a edição. Feche e abra a reavaliação para revisar os dados atuais.",
    );
  if (
    current.severity === input.level &&
    equalIds(current.symptomIds, input.symptomIds) &&
    (current.otherSymptoms ?? "").trim() === complaint
  )
    throw new Error("Altere a gravidade ou os sintomas antes de salvar.");
  // Expanded API has a dedicated justification. Preserve the existing short note there.
  // Legacy deployments still persist the reason through shortNote; never retry a POST with another body.
  // Author and timestamps come exclusively from the authenticated server session.
  const audit = parseReassessment(
    await request(
      `/entries/${encodeURIComponent(input.entryId)}/reassessments`,
      "POST",
      {
        severity: input.level,
        symptomIds: input.symptomIds,
        otherSymptoms: complaint || null,
        shortNote: input.contract === "expanded" ? current.shortNote : reason,
        ...(input.contract === "expanded" ? { justification: reason } : {}),
      },
      input.signal,
    ),
  );
  if (
    audit.entryId !== input.entryId ||
    audit.newSeverity !== input.level ||
    (input.contract === "expanded" && audit.justification !== reason)
  )
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "A confirmação não corresponde a este atendimento. Atualize a fila antes de tentar novamente.",
    );
  return {
    audit,
    complaint: [
      ...audit.symptomsSnapshot.symptoms.map((symptom) => symptom.name),
      audit.symptomsSnapshot.otherSymptoms,
    ]
      .filter(Boolean)
      .join(", "),
    detail: {
      ...current,
      severity: audit.newSeverity,
      otherSymptoms: audit.symptomsSnapshot.otherSymptoms,
      symptomIds: audit.symptomsSnapshot.symptoms.map((symptom) => symptom.id),
      shortNote: audit.observationSnapshot,
      updatedAt: audit.createdAt,
    },
  };
}
export async function getReassessmentHistory(
  entryId: string,
  page: number,
  signal?: AbortSignal,
): Promise<Page<Reassessment>> {
  const value = await request(
    `/entries/${encodeURIComponent(entryId)}/reassessments?page=${page}&pageSize=5`,
    "GET",
    undefined,
    signal,
  );
  if (
    !object(value) ||
    !Array.isArray(value.items) ||
    !Number.isInteger(value.total) ||
    Number(value.total) < 0 ||
    !Number.isInteger(value.page) ||
    Number(value.page) < 1 ||
    !Number.isInteger(value.pageSize) ||
    Number(value.pageSize) < 1
  )
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "Não foi possível interpretar o histórico de reavaliações.",
    );
  const items = value.items.map(parseReassessment);
  if (items.some((item) => item.entryId !== entryId))
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "O histórico não corresponde a este atendimento.",
    );
  return {
    items,
    total: Number(value.total),
    page: Number(value.page),
    pageSize: Number(value.pageSize),
  };
}

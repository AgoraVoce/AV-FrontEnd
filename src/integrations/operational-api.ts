import { ApiError, request, requestWithMeta } from "./client";
import type {
  EmployeeRecord,
  DoctorItem,
  EntryRecord,
  PatientRecord,
} from "./client";

export type Severity = DoctorItem["severity"];
export type EntryStatus =
  "waiting" | "called" | "in_progress" | "completed" | "cancelled";
export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
export type Patient = PatientRecord & {
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Doctor = {
  id: string;
  name: string;
  specialty: { id: string; name: string };
  shift: { id: string; startsAt: string; endsAt: string; room: string | null };
};
export type Employee = EmployeeRecord & {
  createdAt: string;
  updatedAt: string;
};
export type Medication = { name: string; dosage: string; instructions: string };
export type Prescription = {
  description: string;
  medications: Medication[];
  notes?: string | null;
};
export type PrescriptionDraftPayload = {
  description: string;
  medications: Medication[];
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type PrescriptionDraftResult = {
  entryId: string;
  draft: PrescriptionDraftPayload | null;
  etag: string | null;
};
export type PrescriptionEmailStatus =
  | "queued"
  | "processing"
  | "accepted"
  | "delivery_delayed"
  | "delivered"
  | "failed"
  | "unknown";
export type PrescriptionEmailResult = {
  supported: boolean;
  eligible: boolean;
  reasonCode: string | null;
  latestDelivery: null | {
    deliveryId: string;
    status: PrescriptionEmailStatus;
    requestedAt: string;
    updatedAt: string;
    acceptedAt: string | null;
    deliveredAt: string | null;
    failureCode: string | null;
  };
};
export type PrescriptionEmailRequest = {
  deliveryId: string;
  entryId: string;
  status: PrescriptionEmailStatus;
  requestedAt: string;
};
export type EntrySymptoms = { id: string; name: string }[];
export type EntryDetail = {
  id: string;
  patientId: string;
  enteredAt: string;
  severity: Severity;
  status: EntryStatus;
  assignedDoctorId: string | null;
  queueCode: string | null;
  otherSymptoms: string | null;
  shortNote: string | null;
  symptomIds?: string[];
  symptoms?: EntrySymptoms;
  updatedAt?: string;
  queuePosition: number | null;
  patient: { id: string; fullName: string; birthDate: string | null };
  doctor: { id: string; name: string } | null;
  timestamps: {
    enteredAt: string;
    calledAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
  prescription: (Prescription & { id?: string; createdAt?: string }) | null;
  room?: string | null;
};

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "A API retornou dados inesperados.",
    );
  return value as Record<string, unknown>;
}
function page<T>(value: unknown): Page<T> {
  const raw = object(value);
  if (
    !Array.isArray(raw.items) ||
    !Number.isInteger(raw.total) ||
    !Number.isInteger(raw.page) ||
    !Number.isInteger(raw.pageSize) ||
    Number(raw.total) < 0
  )
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "A lista recebida é inválida. Atualize a página.",
    );
  return raw as unknown as Page<T>;
}
function detail(value: unknown): EntryDetail {
  const raw = object(value);
  if (
    typeof raw.id !== "string" ||
    !["waiting", "called", "in_progress", "completed", "cancelled"].includes(
      String(raw.status),
    ) ||
    !raw.patient ||
    typeof object(raw.patient).fullName !== "string"
  )
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "O atendimento retornou dados inesperados.",
    );
  if (
    raw.symptoms !== undefined &&
    (!Array.isArray(raw.symptoms) ||
      !raw.symptoms.every((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
          return false;
        const symptom = item as Record<string, unknown>;
        return (
          typeof symptom.id === "string" && typeof symptom.name === "string"
        );
      }))
  )
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "Os sintomas do atendimento retornaram em formato inesperado.",
    );
  return raw as unknown as EntryDetail;
}
const params = (filter: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filter))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
};
function parseDraft(rawValue: unknown): PrescriptionDraftPayload {
  const raw = object(rawValue);
  if (
    typeof raw.description !== "string" ||
    raw.description.length > 5000 ||
    !Array.isArray(raw.medications) ||
    raw.medications.length > 50 ||
    !Number.isInteger(raw.version) ||
    typeof raw.createdAt !== "string" ||
    typeof raw.updatedAt !== "string" ||
    !(raw.notes === null || typeof raw.notes === "string")
  )
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "O rascunho retornou um formato inesperado.",
    );
  const validMedication = raw.medications.every((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const medication = item as Record<string, unknown>;
    return (
      typeof medication.name === "string" &&
      medication.name.length <= 150 &&
      typeof medication.dosage === "string" &&
      medication.dosage.length <= 150 &&
      typeof medication.instructions === "string" &&
      medication.instructions.length <= 1000
    );
  });
  if (
    !validMedication ||
    (typeof raw.notes === "string" && raw.notes.length > 4000)
  )
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "Os campos do rascunho retornaram um formato inesperado.",
    );
  return raw as unknown as PrescriptionDraftPayload;
}

export const operations = {
  patients: (
    filter: { name?: string; cpf?: string; page?: number; pageSize?: number },
    signal?: AbortSignal,
  ) =>
    request("/patients?" + params(filter), "GET", undefined, signal).then(
      page<Patient>,
    ),
  patient: (id: string, signal?: AbortSignal) =>
    request(
      "/patients/" + encodeURIComponent(id),
      "GET",
      undefined,
      signal,
    ).then((v) => object(v) as unknown as Patient),
  doctors: (
    filter: { name?: string; page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ) =>
    request("/doctors?" + params(filter), "GET", undefined, signal).then(
      page<Doctor>,
    ),
  employees: (
    filter: {
      q?: string;
      role?: string;
      active?: string;
      page?: number;
      pageSize?: number;
    },
    signal?: AbortSignal,
  ) =>
    request("/employees?" + params(filter), "GET", undefined, signal).then(
      page<Employee>,
    ),
  entry: (id: string, signal?: AbortSignal) =>
    request(
      "/entries/" + encodeURIComponent(id),
      "GET",
      undefined,
      signal,
    ).then(detail),
  assignDoctor: (id: string, doctorId: string) =>
    request("/entries/" + encodeURIComponent(id) + "/doctor", "PATCH", {
      doctorId,
    }),
  setStatus: (id: string, status: "in_progress" | "cancelled") =>
    request("/entries/" + encodeURIComponent(id) + "/status", "PATCH", {
      status,
    }).then(detail),
  callNext: () =>
    request("/queues/me/next", "POST").then((value) =>
      value === null ? null : detail(value),
    ),
  prescriptionDraft: async (
    id: string,
    signal?: AbortSignal,
  ): Promise<PrescriptionDraftResult> => {
    const response = await requestWithMeta(
      "/entries/" + encodeURIComponent(id) + "/prescription-draft",
      "GET",
      undefined,
      { signal },
    );
    if (response.status !== 200)
      throw new ApiError(
        502,
        "BAD_RESPONSE",
        "A consulta do rascunho retornou um status inesperado.",
      );
    const value = object(response.data);
    if (value.entryId !== id || (value.draft !== null && !value.draft))
      throw new ApiError(
        502,
        "BAD_RESPONSE",
        "O rascunho retornou um formato inesperado.",
      );
    const raw = value.draft === null ? null : parseDraft(value.draft);
    return { entryId: id, draft: raw, etag: response.etag };
  },
  savePrescriptionDraft: async (
    id: string,
    draft: Pick<
      PrescriptionDraftPayload,
      "description" | "medications" | "notes"
    >,
    etag: string | null,
    signal?: AbortSignal,
  ): Promise<PrescriptionDraftResult> => {
    const response = await requestWithMeta(
      "/entries/" + encodeURIComponent(id) + "/prescription-draft",
      "PUT",
      draft,
      {
        signal,
        headers: etag ? { "If-Match": etag } : { "If-None-Match": "*" },
      },
    );
    if (response.status !== 200 && response.status !== 201)
      throw new ApiError(
        502,
        "BAD_RESPONSE",
        "O salvamento do rascunho retornou um status inesperado.",
      );
    const value = object(response.data);
    if (value.entryId !== id || !value.draft)
      throw new ApiError(
        502,
        "BAD_RESPONSE",
        "O salvamento foi enviado, mas a resposta não pôde ser confirmada.",
      );
    return { entryId: id, draft: parseDraft(value.draft), etag: response.etag };
  },
  deletePrescriptionDraft: async (
    id: string,
    etag: string | null,
    signal?: AbortSignal,
  ) => {
    const response = await requestWithMeta(
      "/entries/" + encodeURIComponent(id) + "/prescription-draft",
      "DELETE",
      undefined,
      { signal, headers: etag ? { "If-Match": etag } : {} },
    );
    if (response.status !== 204)
      throw new ApiError(
        502,
        "BAD_RESPONSE",
        "O descarte do rascunho não foi confirmado.",
      );
  },
  prescriptionEmail: (id: string, signal?: AbortSignal) =>
    requestWithMeta(
      "/entries/" + encodeURIComponent(id) + "/prescription-email",
      "GET",
      undefined,
      { signal },
    ).then(({ data: value, status }) => {
      if (status !== 200)
        throw new ApiError(
          502,
          "BAD_RESPONSE",
          "A consulta do envio retornou um status inesperado.",
        );
      const raw = object(value);
      if (
        typeof raw.supported !== "boolean" ||
        typeof raw.eligible !== "boolean" ||
        !(raw.reasonCode === null || typeof raw.reasonCode === "string")
      )
        throw new ApiError(
          502,
          "BAD_RESPONSE",
          "A disponibilidade do envio retornou um formato inesperado.",
        );
      if (raw.latestDelivery !== null) {
        const latest = object(raw.latestDelivery);
        if (
          typeof latest.deliveryId !== "string" ||
          typeof latest.status !== "string" ||
          ![
            "queued",
            "processing",
            "accepted",
            "delivery_delayed",
            "delivered",
            "failed",
            "unknown",
          ].includes(latest.status) ||
          typeof latest.requestedAt !== "string" ||
          typeof latest.updatedAt !== "string"
        )
          throw new ApiError(
            502,
            "BAD_RESPONSE",
            "O estado do envio retornou um formato inesperado.",
          );
      }
      return raw as unknown as PrescriptionEmailResult;
    }),
  requestPrescriptionEmail: async (
    id: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) => {
    const response = await requestWithMeta(
      "/entries/" + encodeURIComponent(id) + "/prescription-email",
      "POST",
      {},
      {
        signal,
        headers: {
          "Idempotency-Key": idempotencyKey,
          "X-Patient-Consent": "confirmed",
        },
      },
    );
    if (response.status !== 202)
      throw new ApiError(
        502,
        "BAD_RESPONSE",
        "A solicitação de envio retornou um status diferente de 202.",
      );
    const result = object(response.data);
    if (
      result.entryId !== id ||
      typeof result.deliveryId !== "string" ||
      typeof result.requestedAt !== "string" ||
      typeof result.status !== "string" ||
      ![
        "queued",
        "processing",
        "accepted",
        "delivery_delayed",
        "delivered",
        "failed",
        "unknown",
      ].includes(result.status)
    )
      throw new ApiError(
        502,
        "BAD_RESPONSE",
        "A solicitação de envio foi enviada, mas a resposta não pôde ser confirmada.",
      );
    return result as unknown as PrescriptionEmailRequest;
  },
  complete: (
    id: string,
    prescription: Prescription,
    etag?: string | null,
  ): Promise<EntryDetail | null> =>
    requestWithMeta(
      "/entries/" + encodeURIComponent(id) + "/complete",
      "POST",
      {
        prescription,
      },
      { headers: etag ? { "If-Match": etag } : {} },
    ).then((result) => (result.data === null ? null : detail(result.data))),
  createEntry: (input: {
    patientId: string;
    severity: Severity;
    symptomIds: string[];
    otherSymptoms: string;
    shortNote?: string;
    assignedDoctorId?: string;
  }) =>
    request("/entries", "POST", input).then(
      (v) => object(v) as unknown as EntryRecord,
    ),
};

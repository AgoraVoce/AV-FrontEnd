import { ApiError, request } from "./client";
import type { EmployeeRecord, DoctorItem, EntryRecord, PatientRecord } from "./client";

export type Severity = DoctorItem["severity"];
export type EntryStatus = "waiting" | "called" | "in_progress" | "completed" | "cancelled";
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
export type Patient = PatientRecord & {
  birthDate: string | null; email: string | null; phone: string | null;
  createdAt: string; updatedAt: string;
};
export type Doctor = {
  id: string; name: string;
  specialty: { id: string; name: string };
  shift: { id: string; startsAt: string; endsAt: string; room: string | null };
};
export type Employee = EmployeeRecord & { createdAt: string; updatedAt: string };
export type Medication = { name: string; dosage: string; instructions: string };
export type Prescription = { description: string; medications: Medication[]; notes?: string | null };
export type EntryDetail = {
  id: string; patientId: string; enteredAt: string; severity: Severity;
  status: EntryStatus; assignedDoctorId: string | null; queueCode: string | null;
  otherSymptoms: string | null; shortNote: string | null;
  queuePosition: number | null;
  patient: { id: string; fullName: string; birthDate: string | null };
  doctor: { id: string; name: string } | null;
  timestamps: { enteredAt: string; calledAt: string | null; startedAt: string | null; finishedAt: string | null };
  prescription: (Prescription & { id?: string }) | null;
  room?: string | null;
};

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(502, "BAD_RESPONSE", "A API retornou dados inesperados.");
  return value as Record<string, unknown>;
}
function page<T>(value: unknown): Page<T> {
  const raw = object(value);
  if (!Array.isArray(raw.items) || !Number.isInteger(raw.total) || !Number.isInteger(raw.page) ||
      !Number.isInteger(raw.pageSize) || Number(raw.total) < 0)
    throw new ApiError(502, "BAD_RESPONSE", "A lista recebida é inválida. Atualize a página.");
  return raw as Page<T>;
}
function detail(value: unknown): EntryDetail {
  const raw = object(value);
  if (typeof raw.id !== "string" || !["waiting","called","in_progress","completed","cancelled"].includes(String(raw.status)) ||
      !raw.patient || typeof object(raw.patient).fullName !== "string")
    throw new ApiError(502, "BAD_RESPONSE", "O atendimento retornou dados inesperados.");
  return raw as EntryDetail;
}
const params = (filter: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filter))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
};

export const operations = {
  patients: (filter: { name?: string; cpf?: string; page?: number; pageSize?: number }, signal?: AbortSignal) =>
    request("/patients?" + params(filter), "GET", undefined, signal).then(page<Patient>),
  patient: (id: string, signal?: AbortSignal) =>
    request("/patients/" + encodeURIComponent(id), "GET", undefined, signal).then(v => object(v) as unknown as Patient),
  doctors: (filter: { name?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) =>
    request("/doctors?" + params(filter), "GET", undefined, signal).then(page<Doctor>),
  employees: (filter: { q?: string; role?: string; active?: string; page?: number; pageSize?: number }, signal?: AbortSignal) =>
    request("/employees?" + params(filter), "GET", undefined, signal).then(page<Employee>),
  entry: (id: string, signal?: AbortSignal) =>
    request("/entries/" + encodeURIComponent(id), "GET", undefined, signal).then(detail),
  assignDoctor: (id: string, doctorId: string) =>
    request("/entries/" + encodeURIComponent(id) + "/doctor", "PATCH", { doctorId }),
  setStatus: (id: string, status: "in_progress" | "cancelled") =>
    request("/entries/" + encodeURIComponent(id) + "/status", "PATCH", { status }).then(detail),
  callNext: () =>
    request("/queues/me/next", "POST").then(value => value === null ? null : detail(value)),
  complete: (id: string, prescription: Prescription) =>
    request("/entries/" + encodeURIComponent(id) + "/complete", "POST", { prescription }).then(detail),
  createEntry: (input: {
    patientId: string; severity: Severity; symptomIds: string[]; otherSymptoms: string;
    shortNote?: string; assignedDoctorId?: string;
  }) => request("/entries", "POST", input).then(v => object(v) as unknown as EntryRecord),
};

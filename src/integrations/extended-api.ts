import { getAccessToken, clearLocalSession } from "../auth/api";
import { apiEndpoint } from "./api-endpoint";
import { ApiError, request } from "./client";
import type { EntryDetail, Page, Employee } from "./operational-api";

export type EntryHistory = {
  id: string; patientId: string; enteredAt: string; status: string;
  severity: "VERMELHO" | "AMARELO" | "VERDE"; queueCode: string | null;
  patient: { id: string; fullName: string };
  doctor: { id: string; name: string } | null;
  attendance: { calledAt: string | null; startedAt: string | null; finishedAt: string | null; room: string | null } | null;
};
export type ClinicDashboard = {
  date: string; waiting: number; called: number; inProgress: number;
  completedToday: number; cancelledToday: number;
};
export type ClinicReports = {
  period: { dateFrom: string; dateTo: string; timezone: string };
  summary: {
    totalEntries: number; waiting: number; called: number; inProgress: number;
    completed: number; cancelled: number; averageWaitSeconds: number | null; measuredWaits: number;
  };
  bySeverity: Array<{ severity: string; count: number }>;
  doctors: Array<{ doctorId: string; name: string; completed: number; averageAttendanceSeconds: number | null }>;
};
export type DoctorProfile = {
  id: string; userId: string; name: string; specialtyId: string;
  specialty: { id: string; name: string; active: boolean }; active: boolean;
};
export type DoctorShift = {
  id: string; doctorId: string; startsAt: string; endsAt: string;
  availabilityStatus: "DISPONIVEL" | "INDISPONIVEL"; room: string | null;
};
export type PublicCall = { queueCode: string; room: string | null; calledAt: string };
export type Ticket = {
  id: string; codigo: string; tipo: "normal" | "prioritario";
  status: string; horarioEmissao: string; horarioChamada: string | null;
  horarioFinalizacao: string | null; entryId: string | null; nomePaciente: string | null;
};
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(502, "BAD_RESPONSE", "Resposta inesperada da API.");
  return value as Record<string, unknown>;
}
function list<T>(value: unknown): Page<T> {
  const r = obj(value);
  if (!Array.isArray(r.items) || !Number.isInteger(r.total) || !Number.isInteger(r.page) || !Number.isInteger(r.pageSize))
    throw new ApiError(502, "BAD_RESPONSE", "A lista recebida está incompleta.");
  return r as unknown as Page<T>;
}
function items<T>(value: unknown): T[] {
  const r = obj(value);
  if (!Array.isArray(r.items)) throw new ApiError(502, "BAD_RESPONSE", "A API retornou uma lista inválida.");
  return r.items as T[];
}
const encode = encodeURIComponent;
export const extended = {
  doctorDashboard: (signal?: AbortSignal) =>
    request("/doctors/me/dashboard", "GET", undefined, signal).then(v => obj(v) as unknown as ClinicDashboard),
  doctorEntries: (page = 1, signal?: AbortSignal) =>
    request("/doctors/me/entries?page=" + page + "&pageSize=10", "GET", undefined, signal).then(list<EntryHistory>),
  active: (signal?: AbortSignal) =>
    request("/doctors/me/active", "GET", undefined, signal).then(v => v === null ? null : obj(v) as unknown as EntryDetail),
  entries: (page = 1, signal?: AbortSignal) =>
    request("/entries?page=" + page + "&pageSize=10", "GET", undefined, signal).then(list<EntryHistory>),
  patientEntries: (id: string, page = 1, signal?: AbortSignal) =>
    request("/patients/" + encode(id) + "/entries?page=" + page + "&pageSize=10", "GET", undefined, signal).then(list<EntryHistory>),
  updatePatient: (id: string, input: { fullName?: string; email?: string | null; phone?: string | null; birthDate?: string | null }) =>
    request("/patients/" + encode(id), "PATCH", input).then(obj),
  updateEmployee: (id: string, input: { name?: string; email?: string; role?: Employee["role"]; active?: boolean }) =>
    request("/employees/" + encode(id), "PATCH", input).then(v => obj(v) as unknown as Employee),
  reports: (from: string, to: string, signal?: AbortSignal) =>
    request("/admin/reports?dateFrom=" + encode(from) + "&dateTo=" + encode(to), "GET", undefined, signal).then(v => obj(v) as unknown as ClinicReports),
  doctor: (id: string, signal?: AbortSignal) =>
    request("/doctors/" + encode(id), "GET", undefined, signal).then(v => obj(v) as unknown as DoctorProfile),
  shifts: (id: string, signal?: AbortSignal) =>
    request("/doctors/" + encode(id) + "/shifts?pageSize=100", "GET", undefined, signal).then(list<DoctorShift>),
  createDoctor: (userId: string, specialtyId: string) =>
    request("/doctors", "POST", { userId, specialtyId, active: true }).then(v => obj(v) as unknown as DoctorProfile),
  publicCalls: async (signal?: AbortSignal) => {
    const response = await fetch(apiEndpoint("/api/v1/public/calls"), { cache: "no-store", signal, credentials: "omit" });
    if (!response.ok) throw new ApiError(response.status, "PUBLIC_CALLS_UNAVAILABLE", "Não foi possível consultar as chamadas.");
    return items<PublicCall>(await response.json());
  },
  tickets: {
    waiting: (signal?: AbortSignal) => request("/tickets/waiting", "GET", undefined, signal).then(items<Ticket>),
    current: (signal?: AbortSignal) => request("/tickets/current", "GET", undefined, signal).then(v => v === null ? null : obj(v) as unknown as Ticket),
    create: (input: { tipo: Ticket["tipo"]; nomePaciente?: string; entryId?: string }) =>
      request("/tickets", "POST", input).then(v => obj(v) as unknown as Ticket),
    next: () => request("/tickets/call-next", "POST").then(v => v === null ? null : obj(v) as unknown as Ticket),
    recall: (id: string) => request("/tickets/" + encode(id) + "/recall", "POST").then(v => obj(v) as unknown as Ticket),
    status: (id: string, status: string) => request("/tickets/" + encode(id) + "/status", "PATCH", { status }).then(v => obj(v) as unknown as Ticket),
  },
};

export async function openPrescriptionPdf(entryId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Sua sessão expirou.");
  const response = await fetch(apiEndpoint("/api/v1/entries/" + encode(entryId) + "/prescription.pdf"), {
    headers: { Authorization: "Bearer " + token, Accept: "application/pdf" }, cache: "no-store",
    credentials: "omit", signal: AbortSignal.timeout(12000),
  });
  if (response.status === 401) {
    clearLocalSession();
    window.dispatchEvent(new Event("av:session-expired"));
  }
  if (!response.ok) throw new ApiError(response.status, "PRESCRIPTION_PDF_ERROR", "Não foi possível abrir a prescrição.");
  if (!(response.headers.get("content-type") || "").includes("application/pdf"))
    throw new ApiError(502, "BAD_RESPONSE", "O servidor não retornou um PDF.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "prescricao-" + entryId + ".pdf";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

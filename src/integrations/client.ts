import { clearLocalSession, getAccessToken } from "../auth/api";
import { apiEndpoint } from "./api-endpoint";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function contract(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ApiError(502, "BAD_RESPONSE", "A API retornou dados inesperados.");
  return value;
}
const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: "E-mail ou senha inválidos.",
  UNAUTHENTICATED: "Sua sessão expirou. Entre novamente.",
  FORBIDDEN: "Seu perfil não possui permissão para esta operação.",
  DOCTOR_PROFILE_UNAVAILABLE: "O cadastro médico da conta está indisponível.",
  ACTIVE_ENTRY_ALREADY_EXISTS: "Este paciente já possui uma entrada ativa.",
  QUEUE_CODE_ALREADY_EXISTS: "Esta senha já está em uso.",
  DOCTOR_UNAVAILABLE: "O médico informado não está disponível neste plantão.",
  DOCTOR_NOT_FOUND: "Médico não encontrado.",
  PATIENT_NOT_FOUND: "Paciente não encontrado. Confira o identificador.",
  INVALID_SYMPTOMS: "Alguns sintomas informados não são válidos.",
  TOO_MANY_ATTEMPTS: "Muitas tentativas. Tente novamente mais tarde.",
  VALIDATION_ERROR: "Há campos inválidos. Confira as informações preenchidas.",
  DOCTOR_BUSY: "Você já tem um paciente chamado ou em atendimento. Conclua esse atendimento antes de chamar outro.",
  ENTRY_STATE_CONFLICT: "O estado deste atendimento mudou. Atualize os dados antes de tentar novamente.",
  ATTENDANCE_NOT_FOUND: "Não há atendimento iniciado para esta entrada.",
  AUTH_SERVICE_UNAVAILABLE: "Não foi possível validar a sessão no servidor. Tente novamente.",
};
function explain(status: number, code: string) {
  if (ERRORS[code]) return ERRORS[code];
  if (status === 409) return "Já existe um cadastro ou registro conflitante.";
  if (status === 400) return "Revise os campos informados e tente novamente.";
  if (status === 401) return ERRORS.UNAUTHENTICATED;
  if (status === 403) return ERRORS.FORBIDDEN;
  if (status === 429) return ERRORS.TOO_MANY_ATTEMPTS;
  return "Não foi possível concluir a operação. Tente novamente.";
}
export async function request(path: string, method: "GET" | "POST" | "PATCH", body?: object, signal?: AbortSignal): Promise<unknown> {
  const token = getAccessToken();
  if (!token) {
    window.dispatchEvent(new Event("av:session-expired"));
    throw new ApiError(401, "UNAUTHENTICATED", ERRORS.UNAUTHENTICATED);
  }
  const timeout = AbortSignal.timeout(12000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(apiEndpoint("/api/v1" + path), {
      method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      credentials: "omit",
      signal: combined,
    });
  } catch {
    if (signal?.aborted) throw new DOMException("Cancelada", "AbortError");
    throw new ApiError(0, "NETWORK_ERROR", "Não foi possível conectar à API. Confira a conexão e a disponibilidade do serviço.");
  }
  if (response.status === 401) {
    clearLocalSession();
    window.dispatchEvent(new Event("av:session-expired"));
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as unknown;
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
    throw new ApiError(response.status, code, explain(response.status, code));
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new ApiError(502, "BAD_RESPONSE", "A API retornou dados inesperados.");
  }
}
export interface WaitingItem {
  entryId: string;
  fullName: string;
  queueCode: string | null;
}
export interface DoctorItem extends WaitingItem {
  patientId: string;
  severity: "VERMELHO" | "AMARELO" | "VERDE";
  enteredAt: string;
  symptoms: Array<{ id: string; name: string }>;
  otherSymptoms: string | null;
  shortNote: string | null;
}
export interface PatientRecord {
  id: string;
  fullName: string;
  cpf: string;
}
export interface EntryRecord {
  id: string;
  status: string;
  enteredAt: string;
}
export interface EmployeeRecord {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEDICO" | "RECEPCIONISTA";
  active: boolean;
}
export async function getWaitingQueue(signal?: AbortSignal): Promise<WaitingItem[]> {
  const data = contract(await request("/queues/waiting", "GET", undefined, signal));
  if (!Array.isArray(data.items) || !data.items.every(
    (item: unknown) => isRecord(item) && typeof item.entryId === "string" &&
      typeof item.fullName === "string" && (item.queueCode === null || typeof item.queueCode === "string")
  )) throw new ApiError(502, "BAD_RESPONSE", "A fila veio em um formato inesperado.");
  return data.items as WaitingItem[];
}
export async function getDoctorQueue(signal?: AbortSignal): Promise<DoctorItem[]> {
  const data = contract(await request("/queues/me", "GET", undefined, signal));
  if (!Array.isArray(data.items) || !data.items.every((item: unknown) =>
    isRecord(item) && typeof item.entryId === "string" && typeof item.patientId === "string" &&
    typeof item.fullName === "string" && (item.queueCode === null || typeof item.queueCode === "string") &&
    ["VERMELHO", "AMARELO", "VERDE"].includes(String(item.severity)) &&
    typeof item.enteredAt === "string" && Array.isArray(item.symptoms) &&
    item.symptoms.every((s: unknown) => isRecord(s) && typeof s.id === "string" && typeof s.name === "string") &&
    (item.otherSymptoms === null || typeof item.otherSymptoms === "string") &&
    (item.shortNote === null || typeof item.shortNote === "string")
  )) throw new ApiError(502, "BAD_RESPONSE", "A fila médica veio em um formato inesperado.");
  return data.items as DoctorItem[];
}
export async function createPatient(input: {
  fullName: string; cpf: string; birthDate?: string; email?: string; phone?: string;
}, signal?: AbortSignal): Promise<PatientRecord> {
  const data = contract(await request("/patients", "POST", input, signal));
  if (typeof data.id !== "string" || typeof data.fullName !== "string" || typeof data.cpf !== "string")
    throw new ApiError(502, "BAD_RESPONSE", "O cadastro foi enviado, mas a resposta não pôde ser verificada. Consulte o banco antes de repetir.");
  return data as unknown as PatientRecord;
}
export async function createEntry(input: {
  patientId: string; severity: DoctorItem["severity"]; symptomIds: string[];
  otherSymptoms: string; shortNote?: string;
}, signal?: AbortSignal): Promise<EntryRecord> {
  const data = contract(await request("/entries", "POST", input, signal));
  if (typeof data.id !== "string" || data.status !== "AGUARDANDO" || typeof data.enteredAt !== "string")
    throw new ApiError(502, "BAD_RESPONSE", "A entrada foi enviada, mas a resposta não pôde ser verificada. Consulte o banco antes de repetir.");
  return data as unknown as EntryRecord;
}
export async function createEmployee(input: {
  name: string; email: string; password: string; role: EmployeeRecord["role"];
}, signal?: AbortSignal): Promise<EmployeeRecord> {
  const data = contract(await request("/employees", "POST", input, signal));
  if (typeof data.id !== "string" || typeof data.name !== "string" ||
      typeof data.email !== "string" || !["ADMIN", "MEDICO", "RECEPCIONISTA"].includes(String(data.role)))
    throw new ApiError(502, "BAD_RESPONSE", "O funcionário foi enviado, mas a resposta não pôde ser verificada. Consulte o banco antes de repetir.");
  return data as unknown as EmployeeRecord;
}

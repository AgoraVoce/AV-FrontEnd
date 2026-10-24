// Pure form validation: no dependency on browser auth/session modules.

export type PatientRegistration = {
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string;
  phone: string;
};
export type PatientRegistrationErrors = Partial<
  Record<keyof PatientRegistration, string>
>;

export function validPatientCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let index = 0; index < length; index++)
      sum += Number(digits[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    if ((remainder === 10 ? 0 : remainder) !== Number(digits[length]))
      return false;
  }
  return true;
}
export function clinicDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const MESSAGES: Record<keyof PatientRegistration, string> = {
  fullName: "Informe o nome do paciente, com até 150 caracteres.",
  cpf: "CPF inválido. Confira os 11 dígitos e os dígitos verificadores.",
  birthDate: "Informe uma data de nascimento válida, sem data futura.",
  email: "Informe um e-mail válido, com até 255 caracteres.",
  phone: "Informe um telefone com até 20 caracteres.",
};
export function validatePatientRegistration(
  patient: PatientRegistration,
  now = new Date(),
): PatientRegistrationErrors {
  const errors: PatientRegistrationErrors = {};
  if (!patient.fullName.trim() || patient.fullName.trim().length > 150)
    errors.fullName = MESSAGES.fullName;
  if (!validPatientCpf(patient.cpf)) errors.cpf = MESSAGES.cpf;
  if (patient.birthDate) {
    const date = new Date(`${patient.birthDate}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(patient.birthDate) ||
      patient.birthDate < "0001-01-01" ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== patient.birthDate ||
      patient.birthDate > clinicDate(now)
    )
      errors.birthDate = MESSAGES.birthDate;
  }
  const email = patient.email.trim();
  if (
    email &&
    (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    errors.email = MESSAGES.email;
  if (patient.phone.trim().length > 20) errors.phone = MESSAGES.phone;
  return errors;
}
export function patientRegistrationError(cause: unknown): {
  message: string;
  fields: PatientRegistrationErrors;
} {
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === "PATIENT_ALREADY_EXISTS"
  ) {
    const message =
      "Já existe um paciente com este CPF. Use Buscar paciente existente para registrar uma nova entrada.";
    return { message, fields: { cpf: message } };
  }
  const fields: PatientRegistrationErrors = {};
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === "VALIDATION_ERROR" &&
    "fields" in cause &&
    cause.fields &&
    typeof cause.fields === "object"
  ) {
    for (const key of Object.keys(cause.fields)) {
      if (key in MESSAGES)
        fields[key as keyof PatientRegistration] =
          MESSAGES[key as keyof PatientRegistration];
    }
  }
  return {
    message: Object.keys(fields).length
      ? "Confira os campos destacados e tente novamente."
      : cause instanceof Error && "code" in cause
        ? cause.message
        : "Não foi possível concluir a operação. Confira a conexão e tente novamente.",
    fields,
  };
}

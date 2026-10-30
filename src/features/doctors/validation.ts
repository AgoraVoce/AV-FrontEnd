import type { ProfessionalInput } from "../clinic/types";
export const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
export function validateDoctor(input: ProfessionalInput) {
  const errors: Record<string, string> = {};
  if (input.name.trim().length < 2 || input.name.trim().length > 150)
    errors.name = "Informe o nome completo.";
  if (!/^\d{1,10}$/.test(input.crmNumber))
    errors.crmNumber = "Informe o CRM com 1 a 10 dígitos.";
  if (!UFS.includes(input.crmUf)) errors.crmUf = "Selecione uma UF válida.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    errors.email = "Informe um e-mail válido.";
  if (
    (input.password !== undefined || input.phone) &&
    !/^\d{10,11}$/.test(input.phone ?? "")
  )
    errors.phone = "Informe DDD e telefone com 10 ou 11 dígitos.";
  if (!input.specialtyId) errors.specialtyId = "Selecione a especialidade.";
  if (
    input.password !== undefined &&
    (input.password.length < 8 || input.password.length > 1024)
  )
    errors.password = "Informe uma senha com 8 a 1024 caracteres.";
  return errors;
}

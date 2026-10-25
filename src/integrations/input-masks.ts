/** Visual masks: keep CPF/phone digits unformatted in the form model and API. */
export function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + "." + digits.slice(3);
  if (digits.length <= 9) return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6);
  return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6, 9) + "-" + digits.slice(9);
}

export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return "(" + digits;
  const local = digits.slice(2);
  const split = digits.length > 10 ? 5 : 4;
  return "(" + digits.slice(0, 2) + ") " +
    (local.length > split ? local.slice(0, split) + "-" + local.slice(split) : local);
}

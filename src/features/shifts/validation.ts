import type { Shift, ShiftInput } from "../clinic/types";
export function validateShift(
  input: ShiftInput,
  doctorId: string,
  shifts: Shift[],
  id?: string,
  until?: string,
): string {
  const start = Date.parse(input.startsAt),
    end = Date.parse(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return "O horário final deve ser maior que o inicial.";
  if (input.availabilityStatus === "INDISPONIVEL") return "";
  const last = until ? Date.parse(until + "T23:59:59-03:00") : start;
  if (!Number.isFinite(last) || last < start || last - start > 366 * 86400000)
    return "Selecione uma data final da recorrência em até um ano.";
  for (let offset = 0; start + offset <= last; offset += 604800000) {
    const conflict = shifts.find(
      (s) =>
        s.id !== id &&
        s.availabilityStatus === "DISPONIVEL" &&
        Date.parse(s.startsAt) < end + offset &&
        Date.parse(s.endsAt) > start + offset &&
        (s.doctorId === doctorId ||
          (!!input.roomId && s.roomId === input.roomId)),
    );
    if (conflict)
      return conflict.doctorId === doctorId
        ? "O médico já possui um plantão nesse horário."
        : "A sala já possui um plantão nesse horário.";
  }
  return "";
}

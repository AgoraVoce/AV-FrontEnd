import type { Shift, ShiftInput } from "../clinic/types";
export function validateShift(
  input: ShiftInput,
  doctorId: string,
  shifts: Shift[],
  id?: string,
  roomName?: string,
): string {
  if (!doctorId) return "Selecione um médico.";
  if (!input.roomId) return "Selecione uma sala.";
  const start = Date.parse(input.startsAt),
    end = Date.parse(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return "O horário final deve ser maior que o inicial.";
  if (input.availabilityStatus === "INDISPONIVEL") return "";
  const conflict = shifts.find(
    (s) =>
      s.id !== id &&
      s.availabilityStatus === "DISPONIVEL" &&
      Date.parse(s.startsAt) < end &&
      Date.parse(s.endsAt) > start &&
      (s.doctorId === doctorId ||
        s.roomId === input.roomId ||
        (!s.roomId &&
          !!roomName &&
          s.room?.trim().toLocaleLowerCase() ===
            roomName.trim().toLocaleLowerCase())),
  );
  return !conflict
    ? ""
    : conflict.doctorId === doctorId
      ? "O médico já possui um plantão nesse horário."
      : "A sala já possui um plantão nesse horário.";
}

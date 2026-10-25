export type AgeFilter = "all" | "minor" | "adult" | "older" | "unknown";
export type WaitFilter =
  "all" | "up-to-15" | "16-to-30" | "31-to-60" | "over-60" | "unknown";

const clinicDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Civil age in the clinic's timezone; date-only birth dates must not shift a day. */
export function patientAge(
  birthDate: string | null | undefined,
  now: number,
): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const parsed = new Date(`${birthDate}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== birthDate
  )
    return null;
  const parts = clinicDateFormatter.formatToParts(now);
  const civil = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const [year, month, day] = birthDate.split("-").map(Number);
  if (
    year > civil("year") ||
    (year === civil("year") &&
      (month > civil("month") ||
        (month === civil("month") && day > civil("day"))))
  )
    return null;
  return (
    civil("year") -
    year -
    Number(
      civil("month") < month ||
        (civil("month") === month && civil("day") < day),
    )
  );
}
export function waitingMinutes(
  enteredAt: string | undefined,
  now: number,
): number | null {
  if (!enteredAt) return null;
  const entered = Date.parse(enteredAt);
  return Number.isFinite(entered)
    ? Math.max(0, Math.floor((now - entered) / 60_000))
    : null;
}
export function matchesAge(age: number | null, filter: AgeFilter) {
  if (filter === "all") return true;
  if (age === null) return filter === "unknown";
  return (
    (filter === "minor" && age < 18) ||
    (filter === "adult" && age >= 18 && age < 60) ||
    (filter === "older" && age >= 60)
  );
}
export function matchesWait(minutes: number | null, filter: WaitFilter) {
  if (filter === "all") return true;
  if (minutes === null) return filter === "unknown";
  return (
    (filter === "up-to-15" && minutes <= 15) ||
    (filter === "16-to-30" && minutes >= 16 && minutes <= 30) ||
    (filter === "31-to-60" && minutes >= 31 && minutes <= 60) ||
    (filter === "over-60" && minutes > 60)
  );
}

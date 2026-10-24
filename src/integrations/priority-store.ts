import type { Severity } from "./operational-api";

// Presentation only: server data is authoritative; legacy local overrides are not read.
export const PRIORITY_LEVELS = [
  { level: "VERDE", label: "Tranquilo", color: "Verde", tone: "calm", rank: 2 },
  {
    level: "AMARELO",
    label: "Alerta",
    color: "Amarelo",
    tone: "alert",
    rank: 1,
  },
  {
    level: "VERMELHO",
    label: "Urgente",
    color: "Vermelho",
    tone: "urgent",
    rank: 0,
  },
] as const;
export const priorityInfo = (level?: Severity | null) =>
  PRIORITY_LEVELS.find((item) => item.level === level);

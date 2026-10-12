import type { Priority } from "../reception/types";

const LABELS: Record<Priority, string> = {
  urgent: "Urgente",
  alert: "Alerta",
  calm: "Tranquilo",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`priority-badge priority-${priority}`}>
      <span className="priority-dot" aria-hidden="true" />
      {LABELS[priority]}
    </span>
  );
}

import type { Priority } from "../reception/types";

interface StatCardProps {
  priority: Priority;
  count: number;
  label: string;
  goal: string;
}

export function StatCard({ priority, count, label, goal }: StatCardProps) {
  return (
    <div className={`stat-card stat-${priority}`}>
      <strong>
        {count} {label}
      </strong>
      <small>{goal}</small>
    </div>
  );
}

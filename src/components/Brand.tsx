import { Activity } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        <Activity size={30} strokeWidth={3} />
      </span>
      <span>
        Agora <span className="brand-accent">Você</span>
      </span>
    </div>
  );
}

import type { Priority } from "../../reception/types";

const PRIORITIES: { value: Priority; color: string; label: string; description: string }[] = [
  { value: "urgent", color: "Vermelho", label: "Urgente / Emergência", description: "Atendimento Imediato" },
  { value: "alert", color: "Amarelo", label: "Alerta / Atenção", description: "Atendimento Prioritário" },
  { value: "calm", color: "Verde", label: "Tranquilo / Pouco Urgente", description: "Atendimento Geral" },
];

export function LegendaPrioridades() {
  return (
    <section className="nc-priority-legend" aria-labelledby="nc-priority-legend-title">
      <h2 id="nc-priority-legend-title">Legenda de Prioridades</h2>
      <div className="nc-priority-legend-list">
        {PRIORITIES.map(({ value, color, label, description }) => (
          <div className={`nc-priority-legend-row risk-${value}`} key={value}>
            <span className="nc-priority-swatch" aria-hidden="true" />
            <strong>{color}</strong>
            <span>({label})</span>
            <small>{description}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
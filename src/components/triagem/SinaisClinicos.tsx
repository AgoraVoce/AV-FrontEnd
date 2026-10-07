import { Thermometer } from "lucide-react";

interface SinaisClinicosProps {
  queixa: string;
  temperatura: string;
  dor: number;
  onChange: (field: "queixa" | "temperatura", value: string) => void;
  onDorChange: (value: number) => void;
}

export function SinaisClinicos({ queixa, temperatura, dor, onChange, onDorChange }: SinaisClinicosProps) {
  const temperaturaNumerica = Number(temperatura);
  const febril = Number.isFinite(temperaturaNumerica) && temperaturaNumerica >= 38;
  const dorLabel = dor >= 7 ? "Dor intensa" : dor >= 4 ? "Dor moderada" : "Dor leve";

  return (
    <section className="nc-panel" aria-labelledby="nc-sinais-title">
      <div className="nc-panel-heading">
        <div>
          <p className="nc-eyebrow">AVALIAÇÃO INICIAL</p>
          <h2 id="nc-sinais-title">Sinais Clínicos e Queixa Principal</h2>
        </div>
        <span className="nc-stage-label">ETAPA 2</span>
      </div>
      <label className="nc-field nc-complaint-field">
        <span>Queixa principal relatada <b>*</b></span>
        <textarea value={queixa} onChange={(event) => onChange("queixa", event.target.value)} placeholder="Descreva brevemente o motivo da procura" rows={2} required />
      </label>
      <div className="nc-clinical-row">
        <label className="nc-field nc-temperature-field">
          <span>Temperatura corporal</span>
          <div className="nc-temperature-control">
            <Thermometer size={18} aria-hidden="true" />
            <input type="number" min="30" max="45" step="0.1" value={temperatura} onChange={(event) => onChange("temperatura", event.target.value)} aria-label="Temperatura corporal em graus Celsius" />
            <span>°C</span>
          </div>
        </label>
        <span className={`nc-fever-badge${febril ? " is-fever" : ""}`}>{febril ? "• Estado Febril" : "• Sem febre"}</span>
      </div>
      <fieldset className="nc-pain-fieldset">
        <legend>Escala de Dor (EVA)</legend>
        <div className="nc-pain-score"><strong>{dor} / 10</strong><span>{dorLabel}</span></div>
        <div className="nc-pain-scale" role="group" aria-label="Escala de dor de um a dez">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <button key={value} type="button" className={dor === value ? "is-selected" : ""} aria-pressed={dor === value} onClick={() => onDorChange(value)}>{value}</button>
          ))}
        </div>
        <div className="nc-pain-legend"><span>0 Sem dor</span><span>4 Moderada</span><strong className={dor >= 7 ? "is-severe" : ""}>7 Intensa</strong><span>10 Insuportável</span></div>
      </fieldset>
    </section>
  );
}
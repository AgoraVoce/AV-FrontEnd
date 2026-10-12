import { Activity, AlertTriangle, HeartPulse, Thermometer, Wind } from "lucide-react";

export const SYMPTOMS = [
  { id: "chest-pain", label: "Dor no peito", detail: "Risco cardíaco", icon: HeartPulse, highRisk: true },
  { id: "breathlessness", label: "Falta de ar", detail: "Risco respiratório", icon: Wind, highRisk: true },
  { id: "bleeding", label: "Sangramento intenso", detail: "Risco vascular", icon: Activity, highRisk: true },
  { id: "high-fever", label: "Febre alta", detail: "Temp > 38.0°C", icon: Thermometer, highRisk: false },
  { id: "syncope", label: "Desmaio ou síncope", detail: "Perda de consciência", icon: AlertTriangle, highRisk: true },
  { id: "mild-pain", label: "Dor leve ou moderada", detail: "Desconforto geral", icon: Activity, highRisk: false },
  { id: "flu", label: "Sintomas gripais", detail: "Coriza, tosse, congestão", icon: Wind, highRisk: false },
  { id: "speech-change", label: "Alteração da fala", detail: "Déficit neurológico", icon: Activity, highRisk: true },
  { id: "vomiting", label: "Vômitos persistentes", detail: "Risco de desidratação", icon: AlertTriangle, highRisk: false },
] as const;

interface ChecklistSintomasProps {
  sintomas: string[];
  onChange: (next: string[]) => void;
}

export function ChecklistSintomas({ sintomas, onChange }: ChecklistSintomasProps) {
  const toggle = (id: string) => onChange(sintomas.includes(id) ? sintomas.filter((item) => item !== id) : [...sintomas, id]);

  return (
    <fieldset className="nc-panel nc-symptom-panel">
      <legend className="nc-panel-heading nc-fieldset-heading">
        <span><span className="nc-eyebrow">CHECKLIST IMEDIATO</span><strong>Checklist de Sintomas</strong></span>
        <span className="nc-selected-count">{sintomas.length} selecionados</span>
      </legend>
      <div className="nc-symptom-grid">
        {SYMPTOMS.map(({ id, label, detail, icon: Icon, highRisk }) => (
          <label key={id} className={`nc-symptom-option${sintomas.includes(id) ? " is-checked" : ""}${highRisk ? " is-high-risk" : ""}`}>
            <input type="checkbox" checked={sintomas.includes(id)} onChange={() => toggle(id)} />
            <span className="nc-checkbox-mark" aria-hidden="true" />
            <Icon size={17} aria-hidden="true" />
            <span className="nc-symptom-copy"><strong>{label}</strong><small>[{detail}]</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
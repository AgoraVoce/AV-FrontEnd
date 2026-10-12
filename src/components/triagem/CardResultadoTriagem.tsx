import { AlertTriangle, Check, Clock3, RotateCcw, ShieldCheck } from "lucide-react";
import type { Priority } from "../../reception/types";

const PRIORITY_VIEW: Record<Priority, { label: string; color: string; estimate: string; symbol: string }> = {
  urgent: { label: "URGENTE", color: "Vermelho", estimate: "< 15 minutos", symbol: "🔴" },
  alert: { label: "ALERTA", color: "Amarelo", estimate: "< 30 minutos", symbol: "🟡" },
  calm: { label: "TRANQUILO", color: "Verde", estimate: "< 60 minutos", symbol: "🟢" },
};

interface CardResultadoTriagemProps {
  senha: string;
  prioridade: Priority;
  justificativa: string;
  calculado: boolean;
  confirmado: boolean;
  onConfirmar: () => void;
  onRevisar: () => void;
}

export function CardResultadoTriagem({ senha, prioridade, justificativa, calculado, confirmado, onConfirmar, onRevisar }: CardResultadoTriagemProps) {
  const classification = PRIORITY_VIEW[prioridade];
  return (
    <aside className="nc-summary-card" aria-labelledby="nc-summary-title">
      <div className="nc-summary-topline"><span className="nc-directed-badge"><ShieldCheck size={13} aria-hidden="true" /> TRIAGEM DIRIGIDA</span><span className="nc-protocol-badge">• SISTEMA DE TRIAGEM</span></div>
      <div className="nc-ticket-block">
        <p id="nc-summary-title" className="nc-eyebrow">SENHA ATRIBUÍDA</p>
        <strong className="nc-ticket-number">{senha}</strong>
        <span className={`nc-risk-tag risk-${prioridade}`}><span aria-hidden="true">{classification.symbol}</span> {classification.label} ({classification.color})</span>
      </div>
      <div className="nc-summary-reason"><p className="nc-eyebrow">JUSTIFICATIVA CLÍNICA RESUMIDA</p><p>{justificativa}</p></div>
      <div className="nc-estimate"><Clock3 size={17} aria-hidden="true" /><span><small>TEMPO ESTIMADO PARA ATENDIMENTO</small><strong>{classification.estimate}</strong></span></div>
      <div className="nc-summary-actions">
        <button type="button" className="nc-confirm-button" disabled={!calculado || confirmado} onClick={onConfirmar}>
          {confirmado ? <Check size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
          {confirmado ? "Adicionado à fila" : "🟢 Confirmar e Adicionar à Fila"}
        </button>
        <button type="button" className="nc-review-button" onClick={onRevisar}><RotateCcw size={15} aria-hidden="true" /> Revisar Dados do Paciente</button>
      </div>
      {confirmado && <p className="nc-success-note" role="status">Paciente cadastrado. A fila e o painel público foram atualizados.</p>}
      {prioridade === "urgent" && <span className="nc-sr-only"><AlertTriangle aria-hidden="true" /> Risco alto detectado</span>}
    </aside>
  );
}
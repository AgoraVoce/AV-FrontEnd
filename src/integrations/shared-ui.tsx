import { ApiError } from "./client";
import type { EntryStatus, Severity } from "./operational-api";
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Não foi possível concluir a operação. Confira a conexão e tente novamente.";
}
export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
}
const LABELS: Record<EntryStatus,string> = { waiting:"Aguardando",called:"Chamado",in_progress:"Em atendimento",completed:"Finalizado",cancelled:"Desistência" };
export function StatePill({status}:{status:EntryStatus}) {
  return <span className={"operational-state is-"+status}>{LABELS[status] ?? status}</span>;
}
export function RiskPill({value}:{value:Severity}) {
  const labels:Record<Severity,string> = {VERMELHO:"Vermelho · Urgente",AMARELO:"Amarelo · Atenção",VERDE:"Verde"};
  return <span className={"local-severity is-"+value.toLowerCase()}>{labels[value]}</span>;
}

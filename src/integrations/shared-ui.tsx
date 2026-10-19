import type { EntryStatus, Severity } from "./operational-api";
const LABELS: Record<EntryStatus,string> = { waiting:"Aguardando",called:"Chamado",in_progress:"Em atendimento",completed:"Finalizado",cancelled:"Desistência" };
export function StatePill({status}:{status:EntryStatus}) {
  return <span className={"operational-state is-"+status}>{LABELS[status] ?? status}</span>;
}
export function RiskPill({value}:{value:Severity}) {
  const labels:Record<Severity,string> = {VERMELHO:"Vermelho · Urgente",AMARELO:"Amarelo · Atenção",VERDE:"Verde"};
  return <span className={"local-severity is-"+value.toLowerCase()}>{labels[value]}</span>;
}

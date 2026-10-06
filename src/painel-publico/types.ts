export type Prioridade = "URGENTE" | "ALERTA" | "TRANQUILO";
export type Status = "CHAMANDO" | "AGUARDANDO";

export interface Chamada {
  senha: string;
  nome: string;
  prioridade: Prioridade;
  status: Status;
  previsaoMinutos?: number;
  destino?: string;
  medicoResponsavel?: string;
}

import { MapPin, Megaphone, Stethoscope } from "lucide-react";
import type { Chamada } from "../types";

const PRIORITY_NAME = {
  URGENTE: "Urgente",
  ALERTA: "Alerta",
  TRANQUILO: "Tranquilo",
} as const;

export function ChamadaPrincipal({ chamada }: { chamada: Chamada | null }) {
  if (!chamada) {
    return (
      <section className="chamada-hero chamada-empty" aria-labelledby="chamada-atual-title">
        <div className="chamada-status-title">
          <span className="chamada-audio-icon" aria-hidden="true"><Megaphone size={20} /></span>
          <h1 id="chamada-atual-title">FILA DE ESPERA</h1>
        </div>
        <p className="chamada-empty-copy">Nenhum paciente aguardando chamada neste momento.</p>
      </section>
    );
  }

  return (
    <section className={`chamada-hero prioridade-${chamada.prioridade.toLowerCase()}`} aria-labelledby="chamada-atual-title">
      <div className="chamada-hero-topline">
        <div className="chamada-status-title">
          <span className="chamada-audio-icon" aria-hidden="true"><Megaphone size={20} /></span>
          <h1 id="chamada-atual-title">CHAMANDO AGORA</h1>
        </div>
        <span className={`chamada-priority-pill prioridade-${chamada.prioridade.toLowerCase()}`}>
          <span aria-hidden="true" /> {PRIORITY_NAME[chamada.prioridade].toUpperCase()}
        </span>
      </div>

      <div className="chamada-hero-main" aria-live="polite" aria-atomic="true">
        <p className="chamada-ticket">{chamada.senha}</p>
        <p className="chamada-patient-label">NOME DO PACIENTE</p>
        <p className="chamada-patient-name">{chamada.nome.toLocaleUpperCase("pt-BR")}</p>
      </div>

      <div className="chamada-hero-footer">
        <div className="chamada-detail chamada-destination">
          <span className="chamada-detail-icon" aria-hidden="true"><MapPin size={20} /></span>
          <span className="chamada-detail-copy">
            <span className="chamada-detail-label">DESTINO</span>
            <strong>{chamada.destino ?? "CONSULTÓRIO 03"}</strong>
          </span>
        </div>
        <div className="chamada-detail chamada-doctor">
          <span className="chamada-detail-icon" aria-hidden="true"><Stethoscope size={20} /></span>
          <span className="chamada-detail-copy">
            <span className="chamada-detail-label">MÉDICO RESPONSÁVEL</span>
            <strong>{chamada.medicoResponsavel ?? "Dra. Helena Martins"}</strong>
          </span>
        </div>
      </div>
    </section>
  );
}

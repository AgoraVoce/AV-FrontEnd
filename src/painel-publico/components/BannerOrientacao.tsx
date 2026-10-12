import { AlertTriangle } from "lucide-react";

export function BannerOrientacao() {
  return (
    <aside
      className="painel-footer-banner"
      aria-label="Orientação aos pacientes"
    >
      <div className="painel-footer-message">
        <AlertTriangle size={19} aria-hidden="true" />
        <p>
          <strong>ORIENTAÇÃO:</strong> Acompanhe sua senha neste painel e siga a
          orientação da equipe quando for chamado.
        </p>
      </div>
    </aside>
  );
}

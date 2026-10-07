import { AlertTriangle } from "lucide-react";

export function BannerOrientacao() {
  return (
    <aside className="painel-footer-banner" aria-label="Orientação aos pacientes">
      <div className="painel-footer-message">
        <AlertTriangle size={19} aria-hidden="true" />
        <p>
          <strong>ATENÇÃO:</strong> Tenha em mãos seu documento com foto e cartão do convênio ou SUS.
        </p>
      </div>
      <span className="painel-protocol-badge">PROTOCOLO DE MANCHESTER ATIVO</span>
    </aside>
  );
}
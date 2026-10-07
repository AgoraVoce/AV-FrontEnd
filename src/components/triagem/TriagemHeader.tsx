import { useEffect, useState } from "react";
import { Clock3, UserRound } from "lucide-react";

interface TriagemHeaderProps {
  userName: string;
}

function getCurrentTime() {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

export function TriagemHeader({ userName }: TriagemHeaderProps) {
  const [currentTime, setCurrentTime] = useState(getCurrentTime);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(getCurrentTime()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <header className="nc-page-header">
      <div className="nc-page-heading-copy">
        <p className="nc-breadcrumb"><span>PRONTO ATENDIMENTO</span><b>›</b><span>TRIAGEM E CLASSIFICAÇÃO</span><b>›</b><strong>ADMISSÃO</strong></p>
        <h1>Novo Cadastro e Triagem Rápida</h1>
        <p className="nc-page-subtitle">Preencha as informações clínicas preliminares do paciente para a determinação de risco e priorização na fila.</p>
      </div>
      <div className="nc-header-context">
        <div className="nc-header-profile"><span className="nc-header-avatar"><UserRound size={17} aria-hidden="true" /></span><span><strong>{userName}</strong><small>Triagem &amp; Recepção</small></span></div>
        <span className="nc-header-clock" aria-label={`Horário atual ${currentTime}`}><Clock3 size={15} aria-hidden="true" /><time>{currentTime}</time></span>
      </div>
    </header>
  );
}
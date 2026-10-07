import { useEffect, useState } from "react";

function formatClock(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function HeaderPainel() {
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="painel-header">
      <div className="painel-header-status">
        <div className="painel-live-status" role="status">
          <span className="painel-live-dot" aria-hidden="true" />
          <span>Painel em Tempo Real</span>
        </div>
        <time className="painel-clock" aria-label={`Horário ${clock}`}>{clock}</time>
      </div>
    </header>
  );
}

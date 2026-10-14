import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import { Brand } from "../../components/Brand";

function formatClock(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function HeaderPainel({
  presentation,
  developmentMode,
}: {
  presentation: "admin" | "tv";
  developmentMode: boolean;
}) {
  const navigate = useNavigate();
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(
      () => setClock(formatClock(new Date())),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError("A tela cheia precisa ser autorizada pelo navegador.");
    }
  };

  const exitTransmission = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        setFullscreenError(
          "Não foi possível sair da tela cheia. Voltando ao painel.",
        );
      }
    }
    navigate("/transmissao");
  };

  return (
    <header
      className={`painel-header${presentation === "tv" ? " is-tv-header" : ""}`}
    >
      <div className="painel-brand-lockup">
        <Brand compact />
        <div className="painel-brand-copy">
          <p className="painel-brand-title">Painel público de chamada</p>
          <p className="painel-facility-subtitle">Estado operacional da fila</p>
        </div>
      </div>
      <div className="painel-header-status">
        {developmentMode && (
          <span className="painel-dev-badge">
            Desenvolvimento · estado local
          </span>
        )}
        {presentation === "admin" ? (
          <Link className="painel-start-button" to="/transmissao/tv">
            Iniciar transmissão
          </Link>
        ) : (
          <>
            <button
              type="button"
              className="painel-fullscreen-button"
              onClick={() => void toggleFullscreen()}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 size={16} aria-hidden="true" />
              ) : (
                <Maximize2 size={16} aria-hidden="true" />
              )}
              {isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            </button>
            <button
              type="button"
              className="painel-exit-button"
              onClick={() => void exitTransmission()}
            >
              Sair da transmissão
            </button>
          </>
        )}
        <time className="painel-clock" aria-label={`Horário ${clock}`}>
          {clock}
        </time>
      </div>
      {fullscreenError && (
        <p className="painel-fullscreen-error" role="alert">
          {fullscreenError}
        </p>
      )}
    </header>
  );
}

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { HeaderPainel } from "../painel-publico/components/HeaderPainel";
import { extended, type PublicCall } from "./extended-api";
import { formatDate } from "./shared-helpers";
import "../painel-publico/styles/painel-publico.css";
import "./local.css";

/** The public endpoint intentionally omits patient identity and clinical details. */
export function PublicCallsScreen({ presentation }: { presentation: "tv" | "admin" }) {
  const [items, setItems] = useState<PublicCall[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const calls = await extended.publicCalls(signal);
      if (!signal?.aborted) { setItems(calls); setError(""); }
    } catch {
      if (!signal?.aborted) setError("Não foi possível atualizar as chamadas. Tentaremos novamente automaticamente.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(controller.signal); }, 10000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refresh]);
  const content = <div className={"painel-publico" + (presentation === "tv" ? " is-tv-mode" : "")}>
    <HeaderPainel presentation={presentation} developmentMode={false} />
    {error && <p className="local-message is-error" role="status">{error}</p>}
    {loading && <p className="local-note" role="status">Consultando chamadas do pronto-socorro…</p>}
    <section className="chamada-hero" aria-live="polite" aria-atomic="true" aria-label="Última chamada">
      <div className="chamada-status-title"><h1>ÚLTIMA CHAMADA</h1></div>
      {items[0] ? <div className="chamada-hero-main">
        <p className="chamada-ticket">{items[0].queueCode}</p>
        <p className="chamada-patient-label">CONSULTÓRIO</p>
        <p className="chamada-patient-name">{items[0].room || "A CONFIRMAR"}</p>
        <p className="local-note">Chamada em {formatDate(items[0].calledAt)}</p>
      </div> : !loading && !error ? <p className="local-note">Ainda não há chamadas registradas nas últimas 24 horas.</p> : null}
    </section>
    <section className="proximos-section" aria-labelledby="public-history-title">
      <div className="proximos-heading"><h2 id="public-history-title">Chamadas recentes</h2><p>Histórico das últimas 24 horas</p></div>
      <div className="proximos-grid">
        {items.slice(1).map((call, index) => <article className="proximo-card" key={call.queueCode + call.calledAt + index}>
          <span className="proximo-card-label">SENHA</span><strong className="proximo-ticket">{call.queueCode}</strong>
          <p className="proximo-state">Sala: {call.room || "A confirmar"}</p>
          <p className="proximo-state">{formatDate(call.calledAt)}</p>
        </article>)}
        {!loading && items.length < 2 && <p className="proximos-empty">Nenhuma outra chamada recente.</p>}
      </div>
    </section>
  </div>;
  if (presentation === "tv") return <main className="painel-tv-root">{content}</main>;
  return <AppShell>{content}</AppShell>;
}

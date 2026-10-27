import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell } from "../components/AppShell";
import { useToast } from "../components/useToast";
import { usePageTitle } from "../components/usePageTitle";
import { extended, type Ticket } from "./extended-api";
import { errorText, formatDate } from "./shared-helpers";
import "./local.css";
import "./operations.css";

export function TicketDesk() {
  usePageTitle("Senhas da recepção");
  const toast = useToast();
  const [waiting, setWaiting] = useState<Ticket[]>([]);
  const [current, setCurrent] = useState<Ticket | null>(null);
  const [kind, setKind] = useState<Ticket["tipo"]>("normal");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const locked = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [list, now] = await Promise.all([extended.tickets.waiting(signal), extended.tickets.current(signal)]);
      if (!signal?.aborted) { setWaiting(list); setCurrent(now); setFailure(""); }
    } catch (err) {
      if (!signal?.aborted) setFailure(errorText(err));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const id = window.setInterval(() => { if (!document.hidden && !locked.current) void refresh(controller.signal); }, 15000);
    return () => { controller.abort(); window.clearInterval(id); };
  }, [refresh]);

  const action = async (task: () => Promise<unknown>, feedback: string) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try { await task(); toast.success(feedback); await refresh(); }
    catch (err) { toast.error("Não foi possível atualizar a senha", errorText(err)); await refresh(); }
    finally { locked.current = false; setBusy(false); }
  };
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action(async () => {
      await extended.tickets.create({ tipo: kind, ...(name.trim() ? { nomePaciente: name.trim() } : {}) });
      setName("");
    }, "Senha emitida");
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Recepção · Atendimento administrativo</span>
      <h1>Controle de senhas</h1>
      <p>Emissão e chamada de senhas administrativas. Este fluxo é independente da fila clínica dos médicos.</p></div>
      <button className="local-secondary-button" type="button" onClick={() => void refresh()} disabled={busy}>Atualizar</button>
    </header>
    {failure && <div role="alert" className="local-message is-error">{failure}<button type="button" className="local-secondary-button" onClick={() => void refresh()}>Tentar novamente</button></div>}
    <section className="local-form operational-single-form">
      <h2>Emitir senha</h2>
      <form onSubmit={create} className="local-fields">
        <label>Tipo de senha<select value={kind} onChange={event => setKind(event.target.value as Ticket["tipo"])}>
          <option value="normal">Normal</option><option value="prioritario">Prioritária</option>
        </select></label>
        <label>Identificação (opcional)<input maxLength={150} value={name} onChange={event => setName(event.target.value)} placeholder="Nome para controle interno" /></label>
        <div className="local-actions"><button className="local-primary" type="submit" disabled={busy}>Emitir senha</button></div>
      </form>
    </section>
    <section className="local-form">
      <div className="operational-row"><h2>Senha chamada</h2>
        <button className="local-primary" type="button" disabled={busy || loading || !!current || waiting.length === 0} onClick={() => void action(() => extended.tickets.next(), "Próxima senha chamada")}>Chamar próxima</button></div>
      {loading ? <p role="status">Consultando senhas…</p> : current ? <>
        <p className="operational-kpi"><strong>{current.codigo}</strong> · {current.tipo === "prioritario" ? "Prioritária" : "Normal"} · Chamada {formatDate(current.horarioChamada)}</p>
        <div className="local-actions">
          <button type="button" className="local-secondary-button" disabled={busy} onClick={() => void action(() => extended.tickets.recall(current.id), "Chamada repetida")}>Chamar novamente</button>
          <button type="button" className="local-primary" disabled={busy} onClick={() => void action(() => extended.tickets.status(current.id, "finalizada"), "Senha finalizada")}>Finalizar senha</button>
          <button type="button" className="local-secondary-button" disabled={busy} onClick={() => { if (window.confirm("Confirmar que a pessoa não compareceu?")) void action(() => extended.tickets.status(current.id, "nao_compareceu"), "Não comparecimento registrado"); }}>Não compareceu</button>
        </div>
      </> : <p className="local-note">Nenhuma senha chamada no momento.</p>}
    </section>
    <section className="local-form">
      <h2>Aguardando chamada · {waiting.length}</h2>
      {!loading && waiting.length === 0 && <p className="local-note">Nenhuma senha aguardando.</p>}
      {waiting.length > 0 && <div className="local-table-wrap"><table className="local-table"><thead><tr><th scope="col">Senha</th><th scope="col">Tipo</th><th scope="col">Emissão</th><th scope="col">Ação</th></tr></thead>
        <tbody>{waiting.map(ticket => <tr key={ticket.id}><td><strong>{ticket.codigo}</strong></td><td>{ticket.tipo === "prioritario" ? "Prioritária" : "Normal"}</td><td>{formatDate(ticket.horarioEmissao)}</td><td>
          <button className="local-secondary-button" type="button" disabled={busy} onClick={() => { if (window.confirm("Cancelar a senha " + ticket.codigo + "?")) void action(() => extended.tickets.status(ticket.id, "cancelada"), "Senha cancelada"); }}>Cancelar</button>
        </td></tr>)}</tbody></table></div>}
    </section>
  </div></AppShell>;
}

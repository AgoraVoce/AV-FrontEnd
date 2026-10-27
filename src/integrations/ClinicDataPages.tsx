import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { useToast } from "../components/useToast";
import { extended, openPrescriptionPdf, type ClinicReports, type EntryHistory } from "./extended-api";
import { errorText, formatDate } from "./shared-helpers";
import { operations, type Patient, type Page } from "./operational-api";
import "./local.css";
import "./operations.css";

function EntryTable({ data, pdf = false }: { data: EntryHistory[]; pdf?: boolean }) {
  const toast = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);
  async function download(id: string) {
    setDownloading(id);
    try { await openPrescriptionPdf(id); } catch (error) { toast.error("PDF indisponível", errorText(error)); }
    finally { setDownloading(null); }
  }
  return <div className="local-table-wrap"><table className="local-table"><thead><tr>
    <th scope="col">Paciente</th><th scope="col">Entrada</th><th scope="col">Médico</th><th scope="col">Gravidade</th><th scope="col">Situação</th>{pdf && <th scope="col">Documento</th>}
    </tr></thead><tbody>{data.map(item => <tr key={item.id}>
    <td><strong>{item.patient?.fullName || "Não informado"}</strong></td><td>{formatDate(item.enteredAt)}</td><td>{item.doctor?.name || "Não atribuído"}</td>
    <td>{item.severity}</td><td>{item.status}</td>
    {pdf && <td>{item.status === "FINALIZADO" ? <button type="button" className="local-secondary-button" disabled={downloading === item.id} onClick={() => void download(item.id)}>{downloading === item.id ? "Abrindo…" : "Baixar prescrição"}</button> : "—"}</td>}
    </tr>)}</tbody></table></div>;
}

export function EntryHistoryPage({ kind }: { kind: "doctor" | "reception" }) {
  usePageTitle(kind === "doctor" ? "Meus atendimentos" : "Histórico de entradas");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<EntryHistory> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (kind === "doctor" ? extended.doctorEntries(page, controller.signal) : extended.entries(page, controller.signal))
        .then(response => { if (!controller.signal.aborted) { setResult(response); setError(""); } })
        .catch(err => { if (!controller.signal.aborted) setError(errorText(err)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, page, revision]);
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Histórico operacional</span><h1>{kind === "doctor" ? "Meus atendimentos" : "Entradas registradas"}</h1>
      <p>{kind === "doctor" ? "Atendimentos vinculados à sua conta médica." : "Consulte o histórico operacional com acesso restrito à recepção."}</p></div>
      <button type="button" className="local-secondary-button" onClick={() => { setLoading(true); setRevision(n => n + 1); }}>Atualizar</button>
    </header>
    <section className="local-form">
      {loading && <p role="status">Carregando histórico…</p>}
      {error && <div role="alert" className="local-message is-error">{error}<button type="button" className="local-secondary-button" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></div>}
      {!loading && !error && result?.items.length === 0 && <div className="local-empty"><h2>Nenhum atendimento encontrado</h2><p>Quando houver entradas registradas, elas aparecerão aqui.</p></div>}
      {!loading && !error && !!result?.items.length && <EntryTable data={result.items} pdf={kind === "doctor"} />}
      {result && !error && <div className="operational-pagination"><span>{result.total} registros · Página {result.page} de {Math.max(1, Math.ceil(result.total / result.pageSize))}</span>
        <div className="local-actions"><button className="local-secondary-button" type="button" disabled={loading || page === 1} onClick={() => { setLoading(true); setPage(p => p - 1); }}>Anterior</button>
          <button className="local-secondary-button" type="button" disabled={loading || page * result.pageSize >= result.total} onClick={() => { setLoading(true); setPage(p => p + 1); }}>Próxima</button></div></div>}
    </section>
  </div></AppShell>;
}

export function PatientRecords({ patientId }: { patientId: string }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Page<EntryHistory> | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(async (signal: AbortSignal) => {
    const [records, profile] = await Promise.all([extended.patientEntries(patientId, page, signal), operations.patient(patientId, signal)]);
    if (!signal.aborted) { setItems(records); setPatient(profile); setEmail(profile.email ?? ""); setPhone(profile.phone ?? ""); setFailed(false); }
  }, [patientId, page]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void reload(controller.signal).catch(error => { if (!controller.signal.aborted) { setFailed(true); toast.error("Não foi possível carregar o histórico", errorText(error)); } });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [reload, revision, toast]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await extended.updatePatient(patientId, { email: email.trim() || null, phone: phone.trim() || null });
      setEditing(false); toast.success("Cadastro atualizado");
      setRevision(i => i + 1);
    } catch (error) { toast.error("Não foi possível salvar", errorText(error)); }
    finally { setSaving(false); }
  }
  return <section className="local-form" aria-label="Ficha e histórico do paciente">
    <div className="operational-row"><div><h2>Histórico de comparecimentos</h2><p className="local-note">Entradas registradas, com os médicos responsáveis e suas situações.</p></div>
      <button className="local-secondary-button" type="button" onClick={() => setRevision(i => i + 1)}>Atualizar histórico</button></div>
    {patient && <><p><strong>{patient.fullName}</strong> · {patient.email || "E-mail não informado"}</p>
      <button className="local-secondary-button" type="button" onClick={() => setEditing(v => !v)}>{editing ? "Cancelar edição" : "Editar contato"}</button>
      {editing && <form onSubmit={e => void save(e)} className="local-fields">
        <label>E-mail<input type="email" maxLength={150} value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Telefone<input type="tel" maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <div className="local-actions"><button className="local-primary" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar contato"}</button></div>
      </form>}
    </>}
    {failed && <div role="alert" className="local-message is-error">Não foi possível carregar a ficha.<button type="button" onClick={() => setRevision(i => i + 1)}>Tentar novamente</button></div>}
    {items?.items.length === 0 && !failed && <p className="local-note">Nenhuma entrada registrada para este paciente.</p>}
    {!!items?.items.length && !failed && <EntryTable data={items.items} pdf />}
    {items && items.total > items.pageSize && <div className="operational-pagination"><span>{items.total} registros · Página {page}</span>
      <div className="local-actions"><button type="button" className="local-secondary-button" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
        <button type="button" className="local-secondary-button" disabled={page * items.pageSize >= items.total} onClick={() => setPage(p => p + 1)}>Próxima</button></div></div>}
  </section>;
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const n = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("pt-BR").format(value);
const minutes = (seconds: number | null | undefined) => seconds == null ? "Sem amostras" : (seconds / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " min";
export function ReportsPage() {
  usePageTitle("Relatórios operacionais");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<ClinicReports | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!applied) return;
    const ctrl = new AbortController();
    void extended.reports(applied.from, applied.to, ctrl.signal)
      .then(r => { if (!ctrl.signal.aborted) { setData(r); setError(""); } })
      .catch(e => { if (!ctrl.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [applied]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!from || !to || from > to) { setError("Escolha um período válido."); return; }
    setLoading(true); setError(""); setData(null); setApplied({ from, to });
  };
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Administração · Indicadores</span>
      <h1>Relatórios operacionais</h1><p>Resumo de atendimentos conforme os registros do servidor.</p></div><Link to="/admin" className="local-secondary-button">Voltar ao painel</Link></header>
    <section className="local-form"><form className="local-fields" onSubmit={submit}>
      <label>De<input type="date" required value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>Até<input type="date" required min={from} value={to} onChange={e => setTo(e.target.value)} /></label>
      <div className="local-actions"><button className="local-primary" disabled={loading} type="submit">{loading ? "Consultando…" : "Gerar relatório"}</button></div>
    </form></section>
    {error && <p className="local-message is-error" role="alert">{error}</p>}
    {loading && <p className="local-note" role="status">Calculando indicadores…</p>}
    {!loading && !data && !error && <p className="local-note">Selecione um período para consultar os dados.</p>}
    {data && !error && <><section className="local-form"><h2>Visão geral</h2><div className="operational-summary">
      {[["Entradas", data.summary.totalEntries], ["Finalizados", data.summary.completed], ["Desistências", data.summary.cancelled], ["Aguardando", data.summary.waiting]].map(([label, value]) =>
        <div className="operational-kpi" key={label}><span>{label}</span><strong>{n(Number(value))}</strong></div>)}
      </div><p>Espera média até início: <strong>{minutes(data.summary.averageWaitSeconds)}</strong> ({n(data.summary.measuredWaits)} amostras)</p></section>
      <section className="local-form"><h2>Gravidade registrada</h2>{data.bySeverity.length ? <div className="local-table-wrap"><table className="local-table"><thead><tr><th scope="col">Gravidade</th><th scope="col">Entradas</th></tr></thead><tbody>
        {data.bySeverity.map(x => <tr key={x.severity}><td>{x.severity}</td><td>{n(x.count)}</td></tr>)}
      </tbody></table></div> : <p>Nenhuma entrada neste período.</p>}</section>
      <section className="local-form"><h2>Produção por médico</h2>{data.doctors.length ? <div className="local-table-wrap"><table className="local-table"><thead><tr><th scope="col">Médico</th><th scope="col">Finalizados</th><th scope="col">Tempo médio de atendimento</th></tr></thead><tbody>
        {data.doctors.map(x => <tr key={x.doctorId}><td>{x.name}</td><td>{n(x.completed)}</td><td>{minutes(x.averageAttendanceSeconds)}</td></tr>)}
      </tbody></table></div> : <p>Nenhum atendimento finalizado neste período.</p>}</section>
      <p className="local-note">A coorte do resumo considera entradas no período; a produção por médico considera finalizações no período. Médias ignoram registros sem os horários necessários.</p>
    </>}
  </div></AppShell>;
}

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronLeft, ClipboardList, RefreshCw, UserPlus, UsersRound, XCircle } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { useToast } from "../components/useToast";
import { createPatient, getWaitingQueue, type WaitingItem } from "./client";
import { operations, type Doctor, type EntryDetail, type Patient, type Severity } from "./operational-api";
import { errorText, formatDate } from "./shared-helpers";
import { RiskPill, StatePill } from "./shared-ui";
import "./local.css";
import "./operations.css";

export function ReceptionWorkspace() {
  usePageTitle("Recepção · Fila de espera");
  const toast = useToast();
  const [items, setItems] = useState<WaitingItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<EntryDetail | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const ongoing = useRef<AbortController | null>(null);
  const load = useCallback(async (initial = false) => {
    ongoing.current?.abort();
    const controller = new AbortController();
    ongoing.current = controller;
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const result = await getWaitingQueue(controller.signal);
      if (!controller.signal.aborted) {
        setItems(result);
        setError("");
        setUpdatedAt(new Date());
      }
    } catch (cause) {
      if (!controller.signal.aborted) { setError(errorText(cause)); toast.error("Não foi possível atualizar a fila", errorText(cause)); }
    } finally {
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [toast]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(true), 0);
    const interval = window.setInterval(() => void load(), 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); ongoing.current?.abort(); };
  }, [load]);
  const visible = useMemo(() => items.filter(i => [i.fullName, i.queueCode ?? ""].some(s =>
    s.toLocaleLowerCase("pt-BR").includes(filter.trim().toLocaleLowerCase("pt-BR")))), [items, filter]);

  async function openDetails(id: string) {
    setDetailsBusy(true); setSelected(null); setDetailError(""); setConfirmCancel(false);
    try {
      const [entry, physicians] = await Promise.all([operations.entry(id), operations.doctors({ pageSize: 100 })]);
      setSelected(entry); setDoctors(physicians.items); setDoctorId(entry.doctor?.id ?? "");
    } catch (cause) { setDetailError(errorText(cause)); toast.error("Não foi possível consultar a entrada", errorText(cause)); }
    finally { setDetailsBusy(false); }
  }
  async function act(action: "assign" | "cancel") {
    if (!selected || actionBusy) return;
    setActionBusy(true); setDetailError("");
    try {
      if (action === "assign") {
        if (!doctorId) return;
        await operations.assignDoctor(selected.id, doctorId);
        toast.success("Médico atribuído à entrada");
      } else {
        await operations.setStatus(selected.id, "cancelled");
        toast.success("Desistência registrada na fila");
      }
      const id = selected.id;
      setConfirmCancel(false);
      if (action === "cancel") { setSelected(null); }
      else setSelected(await operations.entry(id));
      await load();
    } catch (cause) {
      setDetailError(errorText(cause));
      toast.error("Não foi possível atualizar a entrada", errorText(cause));
      // On conflicts, do not keep offering an outdated action as if it could succeed.
      try { setSelected(await operations.entry(selected.id)); } catch { /* Retain error. */ }
    } finally { setActionBusy(false); }
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head">
      <div><span className="local-eyebrow">Recepção · Atendimento imediato</span>
        <h1>Fila de espera</h1>
        <p>Consulte pacientes em espera, confira seus dados e atribua o médico de plantão. A chamada é feita exclusivamente pelo médico.</p></div>
      <div className="local-actions"><Link className="local-secondary-button" to="/pacientes">Buscar pacientes</Link><Link className="local-primary" to="/novo-cadastro"><UserPlus size={17} aria-hidden="true"/> Cadastrar paciente</Link></div>
    </header>
    <div className="operational-summary">
      <div className="operational-kpi"><span>Pacientes aguardando</span><strong>{loading && !updatedAt ? "—" : items.length}</strong><small>Fila sincronizada com a clínica</small></div>
      <div className="operational-kpi"><span>Última atualização</span><strong className="operational-time">{updatedAt ? updatedAt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "—"}</strong><small>Atualização a cada 30 segundos</small></div>
    </div>
    <div className="local-toolbar">
      <label className="local-search">Buscar por nome ou senha
        <input value={filter} onChange={e=>setFilter(e.target.value)} type="search" placeholder="Nome do paciente ou senha" /></label>
      <button className="local-secondary-button" type="button" disabled={refreshing || loading} onClick={()=>void load()}>
        <RefreshCw size={16} aria-hidden="true"/> {refreshing ? "Atualizando…" : "Atualizar fila"}</button>
    </div>
    {error && <button type="button" className="local-secondary-button" onClick={()=>void load()}>Tentar carregar a fila novamente</button>}
    {loading ? <p className="local-message" role="status">Carregando pacientes…</p> :
      !error && visible.length === 0 ? <div className="local-empty"><ClipboardList size={26} aria-hidden="true"/>
        <h2>{filter ? "Nenhum paciente encontrado" : "Nenhum paciente aguardando"}</h2>
        <p>{filter ? "Tente outro nome ou senha." : "Quando a recepção registrar uma entrada, ela aparecerá aqui."}</p></div> :
      !error && <div className="local-table-wrap"><table className="local-table"><thead><tr>
        <th scope="col">Paciente</th><th scope="col">Senha</th><th scope="col">Ações</th>
      </tr></thead><tbody>{visible.map(item=><tr key={item.entryId}>
        <td><strong>{item.fullName}</strong></td><td><span className="local-code">{item.queueCode || "Sem senha"}</span></td>
        <td><button className="local-secondary-button operational-small-button" type="button" onClick={()=>void openDetails(item.entryId)}>Ver detalhes</button></td>
      </tr>)}</tbody></table></div>}
    {(detailsBusy || detailError || selected) && <section className="local-form operational-detail" aria-label="Detalhes da entrada">
      <div className="operational-row"><h2>Detalhes do atendimento</h2><button type="button" className="operational-close" onClick={()=>{setSelected(null);setDetailError("");setConfirmCancel(false);}} aria-label="Fechar detalhes"><XCircle size={21}/></button></div>
      {detailsBusy && <p role="status">Consultando prontidão da fila…</p>}
      {detailError && <button type="button" className="local-secondary-button" onClick={()=>{if(selected)void openDetails(selected.id);}}>Tentar novamente</button>}
      {selected && <><div className="operational-row operational-detail-head">
        <div><strong>{selected.patient.fullName}</strong><small>Entrada {formatDate(selected.enteredAt)} · {selected.queueCode || "Sem senha"}</small></div>
        <StatePill status={selected.status}/></div>
        <div className="operational-detail-grid">
          <div><span>Classificação</span><RiskPill value={selected.severity}/></div>
          <div><span>Posição na fila</span><strong>{selected.queuePosition ?? "—"}</strong></div>
          <div><span>Médico responsável</span><strong>{selected.doctor?.name ?? "Ainda não atribuído"}</strong></div>
          <div><span>Queixa relatada</span><strong>{selected.otherSymptoms || "Não informada"}</strong></div>
        </div>
        {selected.status === "waiting" && <div className="operational-action-panel">
          <label className="operational-label">Médico disponível
            <select value={doctorId} onChange={e=>setDoctorId(e.target.value)} disabled={actionBusy}>
              <option value="">Selecione um médico</option>
              {doctors.map(d=><option value={d.id} key={d.id}>{d.name} · {d.specialty.name}{d.shift.room ? " · "+d.shift.room : ""}</option>)}
            </select>
          </label>
          {doctors.length===0 && <p className="local-note">Não há médicos com plantão disponível no momento.</p>}
          <div className="local-actions">
            <button className="local-primary" type="button" onClick={()=>void act("assign")} disabled={!doctorId || actionBusy || doctorId===selected.assignedDoctorId}>{actionBusy ? "Salvando…" : "Salvar médico"}</button>
            <button className="local-secondary-button operational-danger" type="button" disabled={actionBusy} onClick={()=>setConfirmCancel(true)}>Registrar desistência</button>
          </div>
        </div>}
        {selected.status === "called" && <button className="local-secondary-button operational-danger" type="button" disabled={actionBusy} onClick={()=>setConfirmCancel(true)}>Registrar desistência</button>}
        {confirmCancel && <div className="operational-confirm" role="group" aria-label="Confirmação de desistência">
          <p>Confirma a desistência? O paciente sairá da fila de espera e o registro ficará preservado.</p>
          <div className="local-actions"><button type="button" className="local-secondary-button operational-danger" disabled={actionBusy} onClick={()=>void act("cancel")}>Confirmar desistência</button>
          <button type="button" className="local-secondary-button" onClick={()=>setConfirmCancel(false)}>Manter na fila</button></div></div>}
      </>}
    </section>}
    <div className="local-bottom"><Link to="/pacientes" className="local-secondary-button">Pacientes cadastrados</Link><Link to="/novo-cadastro" className="local-secondary-button"><UserPlus size={16}/> Novo atendimento</Link>
      <p className="local-note">O painel mostra somente os pacientes aguardando. Estados clínicos completos aparecem no detalhe individual.</p></div>
  </div></AppShell>;
}

type NewPatient = { fullName: string; cpf: string; birthDate: string; email: string; phone: string };
const EMPTY: NewPatient = { fullName: "", cpf: "", birthDate: "", email: "", phone: "" };

export function PatientSearchWorkspace() {
  usePageTitle("Pacientes cadastrados");
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [listing, setListing] = useState<import("./operational-api").Page<Patient> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const term = search.trim();
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setFailed(false);
      const cpf = term.replace(/\D/g, "");
      const filter = term.length < 2 ? {} : cpf.length === 11 && /^[\d.\-\s]+$/.test(term)
        ? { cpf: term } : { name: term };
      void operations.patients({ ...filter, page: pageNumber, pageSize: 10 }, controller.signal)
        .then(result => { if (!controller.signal.aborted) setListing(result); })
        .catch(cause => { if (!controller.signal.aborted) { setFailed(true); toast.error("Não foi possível buscar pacientes", errorText(cause)); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, term ? 350 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term, pageNumber, revision, toast]);
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div>
      <span className="local-eyebrow">Recepção · Cadastro da clínica</span>
      <h1>Pacientes cadastrados</h1>
      <p>Encontre um paciente pelo nome ou CPF e registre uma nova entrada no pronto-socorro.</p>
    </div><Link className="local-primary" to="/novo-cadastro"><UserPlus size={16} aria-hidden="true" /> Cadastrar paciente</Link></header>
    <section className="local-form">
      <div className="operational-row"><h2><UsersRound size={19} aria-hidden="true" /> Buscar pacientes</h2>
        <button type="button" className="local-secondary-button operational-small-button" disabled={loading} onClick={() => setRevision(n => n + 1)}><RefreshCw size={15} aria-hidden="true" /> Atualizar</button></div>
      <label className="local-search">Buscar paciente por nome ou CPF
        <input type="search" value={search} onChange={e => { setSearch(e.target.value); setPageNumber(1); }} placeholder="Digite o nome ou CPF" autoComplete="off" />
      </label>
      {loading && <p className="local-note" role="status">Buscando pacientes…</p>}
      {!loading && failed && <button type="button" className="local-secondary-button" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button>}
      {!loading && !failed && listing?.items.length === 0 && <div className="local-empty">
        <ClipboardList size={24} aria-hidden="true" /><h2>Nenhum paciente encontrado</h2><p>Verifique a busca ou faça um novo cadastro.</p>
      </div>}
      {!loading && !failed && listing && listing.items.length > 0 && <div className="operational-result-list" aria-label="Pacientes encontrados">
        {listing.items.map(item => <Link className="operational-result" key={item.id} to={"/novo-cadastro?patient=" + encodeURIComponent(item.id)}>
          <span><strong>{item.fullName}</strong><small>CPF terminando em {item.cpf.slice(-4)}</small></span><span className="operational-result-action">Registrar entrada <ArrowRight size={16} aria-hidden="true" /></span>
        </Link>)}
      </div>}
      {!failed && listing && <div className="operational-pagination">
        <span>{listing.total} paciente(s) · Página {listing.page} de {Math.max(1, Math.ceil(listing.total / listing.pageSize))}</span>
        <div className="local-actions">
          <button type="button" className="local-secondary-button operational-small-button" disabled={loading || pageNumber <= 1} onClick={() => setPageNumber(p => p - 1)}><ChevronLeft size={16} aria-hidden="true" /> Anterior</button>
          <button type="button" className="local-secondary-button operational-small-button" disabled={loading || pageNumber * listing.pageSize >= listing.total} onClick={() => setPageNumber(p => p + 1)}>Próxima <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </div>}
    </section>
  </div></AppShell>;
}

export function PatientWorkspace() {
  usePageTitle("Cadastro e entrada de paciente");
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const patientId = params.get("patient");
  const [patient, setPatient] = useState<NewPatient>({ ...EMPTY });
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(patientId));
  const [severity, setSeverity] = useState<Severity>("VERDE");
  const [symptoms, setSymptoms] = useState("");
  const [note, setNote] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!patientId) return;
    const controller = new AbortController();
    void operations.patient(patientId, controller.signal).then(record => {
      if (!controller.signal.aborted) setChosen({ id: record.id, name: record.fullName });
    }).catch(cause => {
      if (!controller.signal.aborted) { toast.error("Não foi possível abrir o paciente", errorText(cause)); navigate("/pacientes", { replace: true }); }
    }).finally(() => { if (!controller.signal.aborted) setLoadingExisting(false); });
    return () => controller.abort();
  }, [patientId, navigate, toast]);
  useEffect(() => {
    if (!chosen) return;
    const controller = new AbortController();
    void operations.doctors({ pageSize: 100 }, controller.signal).then(result => {
      if (!controller.signal.aborted) setDoctors(result.items);
    }).catch(cause => {
      if (!controller.signal.aborted) toast.error("Não foi possível consultar médicos de plantão", errorText(cause));
    });
    return () => controller.abort();
  }, [chosen, toast]);

  async function savePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const saved = await createPatient({
        fullName: patient.fullName.trim(), cpf: patient.cpf.replace(/\D/g, ""),
        ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
        ...(patient.email.trim() ? { email: patient.email.trim() } : {}),
        ...(patient.phone.trim() ? { phone: patient.phone.trim() } : {}),
      });
      setChosen({ id: saved.id, name: saved.fullName });
      toast.success("Paciente cadastrado", "Agora registre a entrada na fila de espera.");
    } catch (cause) { toast.error("Não foi possível cadastrar o paciente", errorText(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen || !symptoms.trim() || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await operations.createEntry({
        patientId: chosen.id, severity, symptomIds: [], otherSymptoms: symptoms.trim(),
        ...(note.trim() ? { shortNote: note.trim() } : {}),
        ...(doctorId ? { assignedDoctorId: doctorId } : {}),
      });
      toast.success("Entrada registrada com sucesso", chosen.name + " foi incluído na fila do pronto-socorro.");
      navigate("/recepcao", { replace: true });
    } catch (cause) { toast.error("Não foi possível registrar a entrada", errorText(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Recepção · Pronto-socorro</span>
      <h1>{chosen ? "Registrar entrada" : "Novo paciente"}</h1>
      <p>{chosen ? "Registre os sintomas, a classificação e o médico de plantão." : "Cadastre o paciente diretamente. Para consultar fichas existentes, utilize Pacientes cadastrados."}</p></div>
      <Link className="local-secondary-button" to={chosen ? "/pacientes" : "/recepcao"}><ChevronLeft size={16} aria-hidden="true" /> {chosen ? "Voltar aos pacientes" : "Voltar à fila"}</Link>
    </header>
    {loadingExisting && <p className="local-note" role="status">Carregando dados do paciente…</p>}
    {!chosen && !loadingExisting && <form className="local-form operational-single-form" onSubmit={e => void savePatient(e)}>
      <div className="operational-row"><div><h2>Dados do paciente</h2><p className="local-note">Preencha as informações para iniciar um novo cadastro.</p></div>
        <Link className="local-secondary-button operational-small-button" to="/pacientes">Buscar paciente existente</Link></div>
      <div className="local-fields">
        <label>Nome completo *<input required autoFocus autoComplete="name" maxLength={150} value={patient.fullName} onChange={e => setPatient(v => ({ ...v, fullName: e.target.value }))} /></label>
        <label>CPF *<input required inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={patient.cpf} onChange={e => setPatient(v => ({ ...v, cpf: e.target.value }))} /></label>
        <label>Data de nascimento<input type="date" value={patient.birthDate} onChange={e => setPatient(v => ({ ...v, birthDate: e.target.value }))} /></label>
        <label>Telefone<input type="tel" maxLength={20} value={patient.phone} onChange={e => setPatient(v => ({ ...v, phone: e.target.value }))} /></label>
        <label className="local-wide">E-mail<input type="email" maxLength={255} value={patient.email} onChange={e => setPatient(v => ({ ...v, email: e.target.value }))} /></label>
      </div>
      <div className="local-actions"><button type="submit" disabled={busy || !patient.fullName.trim() || patient.cpf.replace(/\D/g, "").length !== 11} className="local-primary">
        {busy ? "Salvando…" : "Cadastrar e continuar"} <ArrowRight size={16} aria-hidden="true" /></button>
        <Link className="local-secondary-button" to="/pacientes">Consultar pacientes</Link>
      </div>
    </form>}
    {chosen && !loadingExisting && <form className="local-form operational-single-form" onSubmit={e => void saveEntry(e)}>
      <div className="operational-row"><div><h2>Informações da entrada</h2><p className="local-note">Paciente: <strong>{chosen.name}</strong></p></div>
        <Link className="local-secondary-button operational-small-button" to="/pacientes">Trocar paciente</Link></div>
      <div className="local-fields">
        <label>Classificação informada pela recepção *<select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
          <option value="VERDE">Verde · Baixa prioridade</option><option value="AMARELO">Amarelo · Atenção</option><option value="VERMELHO">Vermelho · Urgente</option>
        </select></label>
        <label>Médico de plantão<select value={doctorId} onChange={e => setDoctorId(e.target.value)}>
          <option value="">Atribuir mais tarde</option>{doctors.map(d => <option value={d.id} key={d.id}>{d.name} · {d.specialty.name}{d.shift.room ? " · " + d.shift.room : ""}</option>)}
        </select></label>
        <label className="local-wide">Sintomas / queixa relatada *<textarea required maxLength={2000} rows={4} value={symptoms} onChange={e => setSymptoms(e.target.value)} placeholder="Descreva a queixa informada pela pessoa" /></label>
        <label className="local-wide">Observações adicionais<textarea maxLength={500} rows={2} value={note} onChange={e => setNote(e.target.value)} /></label>
      </div>
      <p className="local-note">Classificação manual. A ordem de chamada é determinada pelo backend.</p>
      <div className="local-actions"><button type="submit" className="local-primary" disabled={busy || !symptoms.trim()}>
        {busy ? "Registrando…" : "Confirmar entrada no servidor"} <ArrowRight size={16} aria-hidden="true" /></button>
        <Link className="local-secondary-button" to="/recepcao">Cancelar</Link>
      </div>
    </form>}
  </div></AppShell>;
}

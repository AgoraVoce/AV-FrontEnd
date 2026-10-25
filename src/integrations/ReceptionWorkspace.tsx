import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Pencil, ArrowUpDown, AlertTriangle, CheckCheck, Clock3, Filter, Search, ShieldCheck, Siren, Activity, ArrowRight, ChevronLeft, ClipboardList, RefreshCw, UserPlus, UsersRound, XCircle } from "lucide-react";
import { useAuth } from "../auth/context";
import { QueuePriorityLed, type PrioritySavedFeedback } from "../components/QueuePriorityLed";
import { ReassessmentHistory } from "../components/ReassessmentHistory";
import { ReclassificationModal } from "../components/ReclassificationModal";
import { priorityInfo } from "./priority-store";
import { loadReceptionClinicalData } from "./reception-clinical-data";
import { matchesAge, matchesWait, patientAge, waitingMinutes, type AgeFilter, type WaitFilter } from "./reception-filters";
import { PatientRegistrationFields } from "../components/PatientRegistrationFields";
import { patientRegistrationError, validatePatientRegistration, type PatientRegistrationErrors } from "./patient-registration";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { useToast } from "../components/useToast";
import { getReceptionWaitingQueue, type ReceptionQueueItem } from "./reception-waiting";
import { createPatient } from "./client";
import { operations, type Doctor, type EntryDetail, type Patient, type Severity } from "./operational-api";
import { errorText, formatDate } from "./shared-helpers";
import { RiskPill, StatePill } from "./shared-ui";
import "./local.css";
import "./operations.css";
import "./reception-design.css";

export function ReceptionWorkspace() {
  usePageTitle("Recepção · Fila de espera");
  const toast = useToast();
  const { state: session } = useAuth();
  const user = session.status === "authenticated" ? session.user : null;
  const [reviewPatient, setReviewPatient] = useState<ReceptionQueueItem | null>(null);
  const [reviewTrigger, setReviewTrigger] = useState<HTMLElement | null>(null);
  const [priorityFeedback, setPriorityFeedback] = useState<PrioritySavedFeedback | null>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const finishPriorityFeedback = useCallback(() => setPriorityFeedback(null), []);
  const closeReview = useCallback(() => setReviewPatient(null), []);
  const [clinicalDetails, setClinicalDetails] = useState<Record<string, EntryDetail>>({});
  const [clinicalLoading, setClinicalLoading] = useState(false);
  const [items, setItems] = useState<ReceptionQueueItem[]>([]);
  const queueById = useMemo(()=>new Map(items.map(item=>[item.entryId,item])),[items]);
  const itemLevel = useCallback((id: string) => queueById.get(id)?.clinical?.severity ?? clinicalDetails[id]?.severity, [queueById, clinicalDetails]);
  const [filter, setFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ticketFilter, setTicketFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [waitFilter, setWaitFilter] = useState<WaitFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all" | "unknown">("all");
  const activeFilterCount = [ticketFilter, ageFilter, waitFilter, severityFilter].filter(value=>value !== "all").length;
  function resetFilterPage() { setPage(1); setPriorityFeedback(null); }
  function clearClinicalFilters() { setTicketFilter("all"); setAgeFilter("all"); setWaitFilter("all"); setSeverityFilter("all"); resetFilterPage(); }
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selected, setSelected] = useState<EntryDetail | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [lastDetailId, setLastDetailId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const ongoing = useRef<AbortController | null>(null);
  const queueErrorNotified = useRef(false);
  const load = useCallback(async (initial = false) => {
    ongoing.current?.abort();
    const controller = new AbortController();
    ongoing.current = controller;
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const result = await getReceptionWaitingQueue(controller.signal);
      if (!controller.signal.aborted) {
        setItems(result);
        // Keep the previous snapshot while refreshing; replace it with fresh successes below.
        setClinicalDetails(current => Object.fromEntries(result.filter(item=>current[item.entryId]).map(item=>[item.entryId,current[item.entryId]])));
        setClinicalLoading(true);
        setLoading(false);
        setPriorityFeedback(current => current && result.some(item=>item.entryId === current.entryId) ? current : null);
        setError("");
        queueErrorNotified.current = false;
        setUpdatedAt(new Date());
        const details = await loadReceptionClinicalData(result, controller.signal);
        if (!controller.signal.aborted) setClinicalDetails(details);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(errorText(cause));
        if (!queueErrorNotified.current) { queueErrorNotified.current = true; toast.error("Não foi possível atualizar a fila", errorText(cause)); }
      }
    } finally {
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); setClinicalLoading(false); }
    }
  }, [toast]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(true), 0);
    const interval = window.setInterval(() => void load(), 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); ongoing.current?.abort(); };
  }, [load]);
  const visible = useMemo(() => items.filter(item => {
    const detail = clinicalDetails[item.entryId];
    const level = itemLevel(item.entryId);
    const matchesTicket = ticketFilter === "all" || (ticketFilter === "with" ? Boolean(item.queueCode) : !item.queueCode);
    const matchesSeverity = severityFilter === "all" || (severityFilter === "unknown" ? !level : level === severityFilter);
    const term = filter.trim().toLocaleLowerCase("pt-BR");
    return matchesTicket && matchesSeverity && matchesAge(patientAge(detail?.patient.birthDate, now), ageFilter) &&
      matchesWait(waitingMinutes(item.clinical?.enteredAt ?? detail?.enteredAt, now), waitFilter) &&
      [item.fullName, item.queueCode ?? "", item.clinical?.complaint ?? detail?.otherSymptoms ?? ""].some(value=>value.toLocaleLowerCase("pt-BR").includes(term));
  }).sort((a,b) => (priorityInfo(itemLevel(a.entryId))?.rank ?? 3) - (priorityInfo(itemLevel(b.entryId))?.rank ?? 3)),
  [items, ticketFilter, severityFilter, ageFilter, waitFilter, filter, clinicalDetails, now, itemLevel]);

  async function openDetails(id: string) {
    setLastDetailId(id);
    setDetailsBusy(true); setSelected(null); setDetailError(""); setConfirmCancel(false);
    try {
      const [entry, physicians] = await Promise.all([operations.entry(id), operations.doctors({ pageSize: 100 })]);
      setClinicalDetails(details => ({...details, [entry.id]: entry}));
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
  const pages = Math.max(1, Math.ceil(visible.length / 6));
  const currentPage = Math.min(page, pages);
  const pageItems = visible.slice((currentPage - 1) * 6, currentPage * 6);
  const counts = { urgent: 0, alert: 0, calm: 0 };
  for (const item of items) { const info = priorityInfo(itemLevel(item.entryId)); if (info) counts[info.tone]++; }
  const classifiedTotal = counts.urgent + counts.alert + counts.calm;
  function showReviewRow(entryId: string, level: Severity) {
    const filteredIds = new Set(visible.map(item => item.entryId));
    const sorted = items.filter(item=>filteredIds.has(item.entryId)).sort((a,b)=>
      (priorityInfo(a.entryId === entryId ? level : itemLevel(a.entryId))?.rank ?? 3) -
      (priorityInfo(b.entryId === entryId ? level : itemLevel(b.entryId))?.rank ?? 3));
    const index = sorted.findIndex(item=>item.entryId === entryId);
    if (index >= 0) setPage(Math.floor(index / 6) + 1);
  }
  return <AppShell><div className="local-page operational-page reception-live">
    <header className="local-page-head">
      <div><span className="local-eyebrow">TRIAGEM & RECEPÇÃO › <em>GESTÃO DE FILA</em></span>
        <h1>Fila de Espera e Gestão de Prioridades</h1>
        <p>Acompanhamento em tempo real dos pacientes aguardando atendimento clínico e emergencial.</p></div>
      <span className="reception-sync"><span>●</span> Atualização contínua • Última sinc: {updatedAt ? `há ${Math.max(0, Math.floor((now - updatedAt.getTime()) / 1000))}s` : "—"}</span>
    </header>
    <div className="reception-summary">
      <section className="reception-panel reception-total"><UsersRound className="reception-info-icon" size={34}/><h2>TOTAL EM ESPERA</h2><div><strong>{loading && !updatedAt ? "—" : items.length}</strong> <span>pacientes no fluxo ativo</span></div><div className="reception-proportion" aria-label="Proporção dos pacientes com classificação conhecida">{(["urgent", "alert", "calm"] as const).map(tone => <span key={tone} className={tone} style={{width: `${classifiedTotal ? counts[tone] / classifiedTotal * 100 : 0}%`}}/>)}</div><small>{classifiedTotal ? `${classifiedTotal} de ${items.length} pacientes com classificação conhecida` : "Classificação da fila: —"}</small></section>
      <section className="reception-panel"><div className="reception-risk-head"><h2>CLASSIFICAÇÃO DE RISCO (MANCHESTER MODIFICADO)</h2><button className="local-secondary-button" aria-controls="reception-clinical-filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(v=>!v)}><Filter size={14}/> Filtro de visualização</button></div>
        <div className="reception-risks">{[{name:"Urgentes",tone:"urgent" as const,goal:15,Icon:AlertTriangle},{name:"Alertas",tone:"alert" as const,goal:30,Icon:AlertTriangle},{name:"Tranquilos",tone:"calm" as const,goal:60,Icon:CheckCheck}].map(({name,tone,goal,Icon}) => <div className={tone} key={name}><strong><span>●</span> {classifiedTotal ? counts[tone] : "—"} {name}</strong><Icon size={16}/><small>Meta: &lt; {goal} min</small></div>)}</div>
      </section>
    </div>
    <div className="reception-toolbar reception-panel">
      <label className="reception-search"><Search size={17}/><input ref={searchInput} aria-label="Buscar por nome ou senha" value={filter} onChange={e=>{setFilter(e.target.value);setPriorityFeedback(null);setPage(1);}} type="search" placeholder="Filtrar por nome, senha ou queixa..." /></label>
      <button className="local-secondary-button" type="button" disabled={refreshing || loading} onClick={()=>void load()}><RefreshCw size={16}/> {refreshing ? "Atualizando…" : "Atualizar fila"}</button>
      <button className="local-secondary-button" aria-controls="reception-clinical-filters" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(v=>!v)}><Filter size={16}/> Filtrar{activeFilterCount > 0 && <span className="reception-filter-count">{activeFilterCount}</span>}</button>
      <Link className="local-secondary-button" to="/pacientes"><Search size={16}/> Buscar pacientes</Link>
      <Link className="local-primary" to="/novo-cadastro"><UserPlus size={16}/> Cadastrar Paciente</Link>
    </div>
    {filtersOpen && <section id="reception-clinical-filters" className="reception-panel reception-filter-panel" aria-label="Filtros da fila">
      <div className="reception-filter-head"><strong>Filtros da fila</strong><button type="button" className="local-secondary-button" disabled={!activeFilterCount} onClick={clearClinicalFilters}>Limpar filtros</button></div>
      <div className="reception-filter-fields">
        <label>Senha<select value={ticketFilter} onChange={e=>{setTicketFilter(e.target.value);resetFilterPage();}}><option value="all">Todos</option><option value="with">Com senha</option><option value="without">Sem senha</option></select></label>
        <label>Idade<select value={ageFilter} onChange={e=>{setAgeFilter(e.target.value as AgeFilter);resetFilterPage();}}><option value="all">Todas as idades</option><option value="minor">0 a 17 anos</option><option value="adult">18 a 59 anos</option><option value="older">60 anos ou mais</option><option value="unknown">Não informada</option></select></label>
        <label>Tempo de espera<select value={waitFilter} onChange={e=>{setWaitFilter(e.target.value as WaitFilter);resetFilterPage();}}><option value="all">Qualquer tempo</option><option value="up-to-15">Até 15 minutos</option><option value="16-to-30">16 a 30 minutos</option><option value="31-to-60">31 a 60 minutos</option><option value="over-60">Mais de 60 minutos</option><option value="unknown">Não informado</option></select></label>
        <label>Gravidade / cor<select value={severityFilter} onChange={e=>{setSeverityFilter(e.target.value as Severity | "all" | "unknown");resetFilterPage();}}><option value="all">Todas as gravidades</option><option value="VERDE">Verde · Tranquilo</option><option value="AMARELO">Amarelo · Alerta</option><option value="VERMELHO">Vermelho · Urgente</option><option value="unknown">Não informada</option></select></label>
      </div><p className="local-note">Filtros combinados e aplicados automaticamente. Dados ausentes aparecem como “—” e podem ser encontrados em “Não informado”.</p>
    </section>}
    {clinicalLoading && <p className="local-note" role="status">Atualizando dados clínicos dos pacientes…</p>}
    {!clinicalLoading && !loading && !error && items.some(item=>!clinicalDetails[item.entryId]) && <p className="reception-clinical-warning" role="status">Não foi possível consultar os dados clínicos de {items.filter(item=>!clinicalDetails[item.entryId]).length} paciente(s). Eles permanecem na fila; dados indisponíveis ficam como “—”. Use Atualizar fila para tentar novamente.</p>}
    {error && <button type="button" className="local-secondary-button" onClick={()=>void load()}>Tentar carregar a fila novamente</button>}
    {loading ? <p role="status">Carregando pacientes…</p> : !error && <section className="reception-table-panel">
      <div className="reception-table-scroll" ref={tableScroll}><table><thead><tr>{["SENHA","NOME DO PACIENTE","IDADE","QUEIXA PRINCIPAL","CLASSIFICAÇÃO / PRIORIDADE","TEMPO DE ESPERA","STATUS","AÇÃO"].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
        {pageItems.map(item=><tr key={item.entryId} data-priority-entry={item.entryId} className={`${priorityInfo(itemLevel(item.entryId))?.tone ?? "unclassified"}${reviewPatient?.entryId === item.entryId ? " is-reclassifying" : ""}`}><td><span className="reception-ticket">{item.queueCode ? <>{item.queueCode.slice(0, item.queueCode.lastIndexOf("-")+1)}<br/>{item.queueCode.slice(item.queueCode.lastIndexOf("-")+1)}</> : "—"}</span></td><td><div className="reception-name"><span className="reception-initials" aria-hidden="true">{item.fullName.split(" ").filter(Boolean).map(n=>n[0]).slice(0,2).join("")}</span><strong>{item.fullName}</strong></div></td><td>{patientAge(clinicalDetails[item.entryId]?.patient.birthDate, now) !== null ? `${patientAge(clinicalDetails[item.entryId]?.patient.birthDate, now)} anos` : "—"}</td><td>{(item.clinical?.complaint ?? clinicalDetails[item.entryId]?.otherSymptoms) || "—"}</td><td>{itemLevel(item.entryId) ? <span className="reception-priority-pill"><span>●</span> {priorityInfo(itemLevel(item.entryId))?.label}</span> : "—"}</td><td><span className="reception-wait"><Clock3 size={14}/> {waitingMinutes(item.clinical?.enteredAt ?? clinicalDetails[item.entryId]?.enteredAt, now) !== null ? `${waitingMinutes(item.clinical?.enteredAt ?? clinicalDetails[item.entryId]?.enteredAt, now)} min` : "—"}</span></td><td>{(item.clinical?.status ?? clinicalDetails[item.entryId]?.status) ? <StatePill status={(item.clinical?.status ?? clinicalDetails[item.entryId]?.status)!}/> : "—"}</td><td><div className="reception-row-actions"><button className="local-secondary-button reception-review-button" data-review-entry={item.entryId} disabled={reviewPatient?.entryId === item.entryId} onClick={event=>{setPriorityFeedback(null);setReviewTrigger(event.currentTarget);setReviewPatient({...item});}}>{reviewPatient?.entryId === item.entryId ? <><Pencil size={14}/> Alterando...</> : <><ArrowUpDown size={14}/> Alterar prioridade</>}</button><button className="local-secondary-button" onClick={()=>void openDetails(item.entryId)}>Ver detalhes</button></div></td></tr>)}
        {!visible.length && <tr><td colSpan={8}>{clinicalLoading ? "Consultando dados para os filtros…" : filter || activeFilterCount ? "Nenhum paciente encontrado com os filtros selecionados" : "Nenhum paciente aguardando"}</td></tr>}
      </tbody></table>
      {priorityFeedback && !reviewPatient && pageItems.some(item=>item.entryId === priorityFeedback.entryId) && <QueuePriorityLed key={priorityFeedback.id} feedback={priorityFeedback} containerRef={tableScroll} layoutKey={pageItems.map(item=>item.entryId).join(",")} onComplete={finishPriorityFeedback}/>}
      </div>
      <footer className="reception-pagination"><span>Mostrando <strong>{pageItems.length}</strong> de <strong>{visible.length}</strong> pacientes aguardando atendimento</span><div><button className="local-secondary-button" disabled={currentPage <= 1} onClick={()=>{setPriorityFeedback(null);setPage(currentPage-1);}}>‹ Anterior</button><span>Página {currentPage} de {pages}</span><button className="local-secondary-button" disabled={currentPage >= pages} onClick={()=>{setPriorityFeedback(null);setPage(currentPage+1);}}>Próxima ›</button></div></footer>
    </section>}
    {(detailsBusy || detailError || selected) && <section className="local-form operational-detail" aria-label="Detalhes da entrada">
      <div className="operational-row"><h2>Detalhes do atendimento</h2><button type="button" className="operational-close" onClick={()=>{setSelected(null);setDetailError("");setConfirmCancel(false);}} aria-label="Fechar detalhes"><XCircle size={21}/></button></div>
      {detailsBusy && <p role="status">Consultando prontidão da fila…</p>}
      {detailError && <button type="button" className="local-secondary-button" onClick={()=>{if(lastDetailId)void openDetails(lastDetailId);}}>Tentar novamente</button>}
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
      <ReassessmentHistory key={selected.id} entryId={selected.id} user={user} revision={selected.updatedAt}/>
      </>}
    </section>}
    <div className="local-bottom"><Link to="/pacientes" className="local-secondary-button">Pacientes cadastrados</Link><Link to="/novo-cadastro" className="local-secondary-button"><UserPlus size={16}/> Novo atendimento</Link>
      <p className="local-note">O painel mostra somente os pacientes aguardando. Estados clínicos completos aparecem no detalhe individual.</p></div>
    <div className="reception-info-grid">{[{Icon:ShieldCheck,title:"Protocolo Institucional",text:"Alterações manuais de prioridade ficam registradas com carimbo de CRM/COREN e justificativa clínica obrigatória."},{Icon:Activity,title:"Sincronização com Painel TV",text:"A mudança de categoria reordena imediatamente a exibição no monitor de chamadas do saguão."},{Icon:Siren,title:"Alerta ao Corpo Clínico",text:"Pacientes reclassificados para Vermelho emitem aviso sonoro no posto médico de plantão."}].map(({Icon,title,text})=><article className="reception-panel" key={title}><Icon className="reception-info-icon" size={32}/><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
    {reviewPatient && <ReclassificationModal key={reviewPatient.entryId} patient={reviewPatient} contract={reviewPatient.clinical ? "expanded" : "legacy"} responsible={user} available={items.some(item=>item.entryId === reviewPatient.entryId)} returnFocus={reviewTrigger} onClose={closeReview} onSaved={(entry, complaint)=>{setItems(current=>current.map(item=>item.entryId === entry.id && item.clinical ? {...item,clinical:{severity:entry.severity,status:entry.status,enteredAt:entry.enteredAt,complaint}} : item));setClinicalDetails(details=>({...details,[entry.id]:entry}));if(selected?.id === entry.id)setSelected(entry);showReviewRow(entry.id, entry.severity);setPriorityFeedback({id:crypto.randomUUID(),entryId:entry.id,level:entry.severity});closeReview();void load();}} onDetail={entry=>{setClinicalDetails(details=>({...details,[entry.id]:entry}));showReviewRow(entry.id, entry.severity);}}/>}
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
  const [patientErrors, setPatientErrors] = useState<PatientRegistrationErrors>({});
  const [patientFormError, setPatientFormError] = useState("");
  const [entryError, setEntryError] = useState("");
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
    const errors = validatePatientRegistration(patient);
    const birthInput = event.currentTarget.elements.namedItem("patient-birthDate");
    if (birthInput instanceof HTMLInputElement && birthInput.validity.badInput) errors.birthDate = "Complete a data de nascimento ou deixe o campo vazio.";
    setPatientErrors(errors);
    setPatientFormError("");
    if (Object.keys(errors).length) {
      setPatientFormError("Confira os campos destacados antes de continuar.");
      window.requestAnimationFrame(()=>document.getElementById(`patient-${Object.keys(errors)[0]}`)?.focus());
      return;
    }
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
    } catch (cause) {
      const failure = patientRegistrationError(cause);
      setPatientErrors(failure.fields); setPatientFormError(Object.keys(failure.fields).length ? failure.message : "");
      const firstField = Object.keys(failure.fields)[0];
      if(firstField)window.requestAnimationFrame(()=>document.getElementById(`patient-${firstField}`)?.focus());
      toast.error("Não foi possível cadastrar o paciente", failure.message);
    }
    finally { lock.current = false; setBusy(false); }
  }
  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen || !symptoms.trim() || lock.current) return;
    setEntryError("");
    lock.current = true; setBusy(true);
    try {
      await operations.createEntry({
        patientId: chosen.id, severity, symptomIds: [], otherSymptoms: symptoms.trim(),
        ...(note.trim() ? { shortNote: note.trim() } : {}),
        ...(doctorId ? { assignedDoctorId: doctorId } : {}),
      });
      toast.success("Entrada registrada com sucesso", chosen.name + " foi incluído na fila do pronto-socorro.");
      navigate("/recepcao", { replace: true });
    } catch (cause) { setEntryError(errorText(cause)); toast.error("Não foi possível registrar a entrada", errorText(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Recepção · Pronto-socorro</span>
      <h1>{chosen ? "Registrar entrada" : "Novo paciente"}</h1>
      <p>{chosen ? "Registre os sintomas, a classificação e o médico de plantão." : "Cadastre o paciente diretamente. Para consultar fichas existentes, utilize Pacientes cadastrados."}</p></div>
      <Link className="local-secondary-button" to={chosen ? "/pacientes" : "/recepcao"}><ChevronLeft size={16} aria-hidden="true" /> {chosen ? "Voltar aos pacientes" : "Voltar à fila"}</Link>
    </header>
    {loadingExisting && <p className="local-note" role="status">Carregando dados do paciente…</p>}
    {!chosen && !loadingExisting && <form className="local-form operational-single-form" autoComplete="off" noValidate onSubmit={e => void savePatient(e)}>
      <div className="operational-row"><div><h2>Dados do paciente</h2><p className="local-note">Preencha as informações para iniciar um novo cadastro.</p></div>
        <Link className="local-secondary-button operational-small-button" to="/pacientes">Buscar paciente existente</Link></div>
      {patientFormError && <p className="local-message is-error" role="alert">{patientFormError}</p>}
      <PatientRegistrationFields patient={patient} errors={patientErrors} busy={busy} onChange={(field,value)=>{setPatient(current=>({...current,[field]:value}));setPatientErrors(current=>({...current,[field]:undefined}));setPatientFormError("");}}/>
      <div className="local-actions"><button type="submit" disabled={busy} className="local-primary">
        {busy ? "Salvando…" : "Cadastrar e continuar"} <ArrowRight size={16} aria-hidden="true" /></button>
        <Link className="local-secondary-button" to="/pacientes">Consultar pacientes</Link>
      </div>
    </form>}
    {chosen && !loadingExisting && <form className="local-form operational-single-form" onSubmit={e => void saveEntry(e)}>
      {entryError && <p className="local-message is-error" role="alert">{entryError}</p>}
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
        {busy ? "Registrando…" : "Confirmar"} <ArrowRight size={16} aria-hidden="true" /></button>
        <Link className="local-secondary-button" to="/recepcao">Cancelar</Link>
      </div>
    </form>}
  </div></AppShell>;
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ClipboardCheck, ClipboardList, Clock3, Plus, RefreshCw, Stethoscope, Trash2, UserRound, Users } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { useToast } from "../components/useToast";
import { useAuth } from "../auth/context";
import { getDoctorQueue, type DoctorItem } from "./client";
import { operations, type EntryDetail, type Medication, type Prescription } from "./operational-api";
import { errorText, formatDate } from "./shared-helpers";
import { RiskPill, StatePill } from "./shared-ui";
import "./local.css";
import "./operations.css";

const BLANK_MEDICATION: Medication = { name: "", dosage: "", instructions: "" };
function cacheKey(userId: string) { return "av:active-entry:" + userId; }

export function DoctorWorkspace({ view = "dashboard" }: { view?: "dashboard" | "queue" | "detail" | "current" }) {
  const heading = view === "dashboard" ? "Dashboard médico" : view === "queue" ? "Minha fila" : view === "detail" ? "Detalhes do paciente" : "Paciente atual";
  usePageTitle(heading);
  const toast = useToast();
  const navigate = useNavigate();
  const { entryId } = useParams<{ entryId: string }>();
  const { state } = useAuth();
  const doctorName = state.status === "authenticated" ? state.user.name : "Médico";
  const userId = state.status === "authenticated" ? state.user.id : "";
  const [queue, setQueue] = useState<DoctorItem[]>([]);
  const [queueError, setQueueError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "calling" | "starting" | "finishing">("");
  const [active, setActive] = useState<EntryDetail | null>(null);
  const [restoring, setRestoring] = useState(() => Boolean(userId && sessionStorage.getItem(cacheKey(userId))));
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(view === "detail");
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailRevision, setDetailRevision] = useState(0);
  const [description, setDescription] = useState("");
  const [medications, setMedications] = useState<Medication[]>([{ ...BLANK_MEDICATION }]);
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const ongoing = useRef<AbortController | null>(null);
  const lock = useRef(false);

  const refresh = useCallback(async (initial = false) => {
    ongoing.current?.abort();
    const controller = new AbortController();
    ongoing.current = controller;
    if (initial) setLoading(true);
    try {
      const result = await getDoctorQueue(controller.signal);
      if (!controller.signal.aborted) { setQueue(result); setQueueError(false); }
    } catch (cause) {
      if (!controller.signal.aborted) { setQueueError(true); toast.error("Não foi possível carregar a fila", errorText(cause)); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [toast]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(true), 0);
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); ongoing.current?.abort(); };
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const stored = sessionStorage.getItem(cacheKey(userId));
    if (!stored) return;
    let cancelled = false;
    void operations.entry(stored).then(result => {
      if (cancelled) return;
      if (result.status === "called" || result.status === "in_progress") setActive(result);
      else sessionStorage.removeItem(cacheKey(userId));
    }).catch(cause => {
      if (!cancelled) toast.error("Não foi possível recuperar o atendimento ativo", errorText(cause));
    }).finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [userId, toast]);

  useEffect(() => {
    if (view !== "detail" || !entryId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDetailLoading(true); setDetailFailed(false);
      void operations.entry(entryId, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        if (result.status === "called" || result.status === "in_progress") {
          if (userId) sessionStorage.setItem(cacheKey(userId), result.id);
          setActive(result);
          navigate("/medico/atendimento", { replace: true });
        } else setDetail(result);
      }).catch(cause => {
        if (!controller.signal.aborted) { setDetailFailed(true); toast.error("Não foi possível consultar o paciente", errorText(cause)); }
      }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [view, entryId, detailRevision, userId, navigate, toast]);

  async function callNext() {
    if (lock.current || active || restoring) return;
    lock.current = true; setBusy("calling");
    try {
      const result = await operations.callNext();
      if (result) {
        if (userId) sessionStorage.setItem(cacheKey(userId), result.id);
        setActive(result);
        toast.success("Paciente chamado", "Confirme a chegada ao consultório antes de iniciar o atendimento.");
        navigate("/medico/atendimento");
      } else toast.info("Fila vazia", "Nenhum paciente está aguardando chamada.");
    } catch (cause) { toast.error("Não foi possível chamar o paciente", errorText(cause)); }
    finally { setBusy(""); lock.current = false; }
  }
  async function startCare() {
    if (lock.current || !active || active.status !== "called") return;
    lock.current = true; setBusy("starting");
    try {
      const updated = await operations.setStatus(active.id, "in_progress");
      setActive(updated);
      toast.success("Atendimento iniciado", "O início foi registrado no servidor.");
    } catch (cause) {
      toast.error("Não foi possível iniciar o atendimento", errorText(cause));
      try { setActive(await operations.entry(active.id)); } catch { /* Preserve clinical warning. */ }
    } finally { lock.current = false; setBusy(""); }
  }
  function medication(index: number, key: keyof Medication, value: string) {
    setMedications(old => old.map((item, i) => i === index ? { ...item, [key]: value } : item));
    setReview(false);
  }
  function clearForm() {
    setDescription(""); setNotes(""); setMedications([{ ...BLANK_MEDICATION }]); setReview(false); setShowForm(false);
  }
  function valid() {
    return description.trim().length >= 1 && description.trim().length <= 5000 &&
      medications.length >= 1 && medications.length <= 50 &&
      medications.every(m => m.name.trim().length > 0 && m.name.trim().length <= 150 &&
        m.dosage.trim().length > 0 && m.dosage.trim().length <= 150 &&
        m.instructions.trim().length > 0 && m.instructions.trim().length <= 1000) &&
      notes.length <= 4000;
  }
  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || active.status !== "in_progress" || lock.current || !valid()) return;
    if (!review) { setReview(true); return; }
    lock.current = true; setBusy("finishing");
    const prescription: Prescription = {
      description: description.trim(),
      medications: medications.map(m => ({ name: m.name.trim(), dosage: m.dosage.trim(), instructions: m.instructions.trim() })),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try {
      await operations.complete(active.id, prescription);
      if (userId) sessionStorage.removeItem(cacheKey(userId));
      setActive(null); clearForm();
      toast.success("Atendimento finalizado", "Prescrição e finalização confirmadas pelo servidor.");
      navigate("/medico");
    } catch (cause) {
      setReview(false);
      // Never retry a clinical mutation blindly: check its authoritative state first.
      try {
        const current = await operations.entry(active.id);
        if (current.status === "completed") {
          if (userId) sessionStorage.removeItem(cacheKey(userId));
          setActive(null); clearForm();
          toast.info("Finalização já confirmada", "A prescrição está salva. Não envie novamente.");
          navigate("/medico");
        } else { setActive(current); toast.error("Não foi possível finalizar o atendimento", errorText(cause)); }
      } catch {
        toast.error("Confirme a situação antes de repetir", "Não foi possível verificar o resultado no servidor. A prescrição pode ter sido salva.");
      }
    } finally { lock.current = false; setBusy(""); }
  }

  const canCall = !loading && !queueError && !restoring && !active && queue.length > 0;
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div>
      <span className="local-eyebrow">Pronto-socorro · Corpo clínico</span>
      <h1>{heading}</h1>
      <p>{view === "dashboard" ? "Olá, " + doctorName + ". Acompanhe sua jornada de atendimento." :
        view === "queue" ? "Pacientes aguardando, ordenados no backend por prioridade e chegada." :
        view === "detail" ? "Consulte a entrada e as informações de triagem do paciente." :
        "Atendimento individual. Registre cada etapa com segurança."}</p>
    </div>
    {view === "detail" ? <Link className="local-secondary-button" to="/medico/fila"><ArrowLeft size={16} aria-hidden="true" /> Voltar à fila</Link> :
      view === "current" ? <Link className="local-secondary-button" to="/medico"><ArrowLeft size={16} aria-hidden="true" /> Dashboard</Link> :
        <button type="button" className="local-secondary-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} aria-hidden="true" /> Atualizar fila</button>}
    </header>

    {view === "dashboard" && <>
      <div className="operational-summary">
        <div className="operational-kpi"><span>Pacientes aguardando</span><strong>{loading ? "—" : queue.length}</strong><small>Priorizados pelo sistema</small></div>
        <div className="operational-kpi"><span>Seu atendimento</span><strong className="operational-time">{restoring ? "Verificando…" : active ? (active.status === "called" ? "Paciente chamado" : "Em andamento") : "Disponível"}</strong>
          <small>{active ? active.patient.fullName : "Pronto para a próxima chamada"}</small></div>
      </div>
      <div className="operational-dashboard-actions">
        <Link to="/medico/fila" className="operational-dash-link"><ClipboardList size={22} aria-hidden="true" /><strong>Minha fila</strong>
          <span>Consulte os pacientes, a classificação e os detalhes de cada entrada.</span><ArrowRight size={18} aria-hidden="true" className="operational-dash-arrow" /></Link>
        <Link to="/medico/atendimento" className="operational-dash-link"><Stethoscope size={22} aria-hidden="true" /><strong>Paciente atual</strong>
          <span>{active ? "Continuar atendimento de " + active.patient.fullName : "Acompanhar chamadas e registrar atendimento."}</span><ArrowRight size={18} aria-hidden="true" className="operational-dash-arrow" /></Link>
      </div>
      <section className="local-form operational-dashboard-next">
        <div><h2>Próxima chamada</h2><p className="local-note">A seleção é feita exclusivamente pelo backend, respeitando a ordem de prioridade.</p></div>
        {queueError && <button type="button" className="local-secondary-button" onClick={() => void refresh(true)}>Tentar carregar fila novamente</button>}
        {active ? <Link to="/medico/atendimento" className="local-primary">Continuar atendimento <ArrowRight size={16} aria-hidden="true" /></Link> :
          <button type="button" className="local-primary" disabled={!canCall || busy !== ""} onClick={() => void callNext()}>{busy === "calling" ? "Chamando…" : "Chamar próximo paciente"} <ArrowRight size={16} aria-hidden="true" /></button>}
        {!loading && !queueError && queue.length === 0 && !active && <p className="local-note">Não há pacientes aguardando neste momento.</p>}
      </section>
    </>}

    {view === "queue" && <section className="local-form">
      <div className="operational-row"><h2><Users size={19} aria-hidden="true" /> Pacientes na fila</h2><span className="local-note">Atualização automática a cada 30 segundos</span></div>
      {loading && <p className="local-note" role="status">Carregando fila médica…</p>}
      {queueError && <button className="local-secondary-button" type="button" onClick={() => void refresh(true)}>Tentar novamente</button>}
      {!loading && !queueError && queue.length === 0 && <div className="local-empty"><Clock3 size={22} aria-hidden="true" /><h3>Nenhum paciente aguardando</h3><p>Entradas atribuídas ao seu plantão aparecerão aqui.</p></div>}
      {!loading && !queueError && queue.length > 0 && <div className="operational-patient-list">
        {queue.map(item => <Link key={item.entryId} to={"/medico/fila/" + encodeURIComponent(item.entryId)} className="operational-patient-link">
          <div className="operational-patient-identity"><strong>{item.fullName}</strong><small>{item.queueCode || "Sem senha"} · Chegada {formatDate(item.enteredAt)}</small></div>
          <RiskPill value={item.severity} />
          <span className="operational-patient-complaint">{[...item.symptoms.map(s => s.name), item.otherSymptoms].filter(Boolean).join("; ") || "Queixa não informada"}</span>
          <span className="operational-open-label">Ver detalhes <ArrowRight size={17} aria-hidden="true" /></span>
        </Link>)}
      </div>}
      <div className="operational-row">
        <p className="local-note">A chamada do próximo paciente respeita a ordem clínica no servidor.</p>
        {active ? <Link to="/medico/atendimento" className="local-primary">Ir para paciente atual <ArrowRight size={16} aria-hidden="true" /></Link> :
          <button type="button" className="local-primary" disabled={!canCall || busy !== ""} onClick={() => void callNext()}>{busy === "calling" ? "Chamando…" : "Chamar próximo paciente"}</button>}
      </div>
    </section>}

    {view === "detail" && <section className="local-form operational-current">
      {detailLoading && <p className="local-note" role="status">Carregando informações do paciente…</p>}
      {detailFailed && <button type="button" className="local-secondary-button" onClick={() => setDetailRevision(n => n + 1)}>Tentar novamente</button>}
      {!detailLoading && !detailFailed && detail && <>
        <div className="operational-row"><h2>{detail.patient.fullName}</h2><StatePill status={detail.status} /></div>
        <div className="operational-patient"><p className="local-note">{detail.queueCode || "Sem senha"} · Chegada {formatDate(detail.enteredAt)}</p><RiskPill value={detail.severity} /></div>
        <div className="operational-detail-grid">
          <div><span>Queixa relatada</span><strong>{detail.otherSymptoms || "Não informada"}</strong></div>
          <div><span>Observações de entrada</span><strong>{detail.shortNote || "Nenhuma observação"}</strong></div>
          <div><span>Posição na fila</span><strong>{detail.queuePosition ?? "—"}</strong></div>
          <div><span>Médico responsável</span><strong>{detail.doctor?.name || "Não atribuído"}</strong></div>
        </div>
        <p className="local-note">Este detalhe é somente para consulta. A chamada é realizada exclusivamente pelo comando "Chamar próximo paciente".</p>
        <Link to="/medico/fila" className="local-secondary-button"><ArrowLeft size={16} aria-hidden="true" /> Voltar à fila</Link>
      </>}
    </section>}

    {view === "current" && <section className="local-form operational-current" aria-label="Paciente atual">
      <div className="operational-row"><h2><Stethoscope size={19} aria-hidden="true" /> Paciente atual</h2>{active && <StatePill status={active.status} />}</div>
      {restoring && <p role="status" className="local-note">Recuperando atendimento ativo no servidor…</p>}
      {!restoring && active && <>
        <div className="operational-patient">
          <div><span className="local-eyebrow">Paciente</span><h3>{active.patient.fullName}</h3><p className="local-note">{active.queueCode || "Sem senha"} · Chegada {formatDate(active.enteredAt)}</p></div>
          <RiskPill value={active.severity} />
        </div>
        <div className="operational-detail-grid">
          <div><span>Queixa relatada</span><strong>{active.otherSymptoms || "Não informada"}</strong></div>
          <div><span>Observações de entrada</span><strong>{active.shortNote || "Nenhuma observação"}</strong></div>
          <div><span>Sala</span><strong>{active.room || "Verifique a escala"}</strong></div>
          <div><span>Chamada</span><strong>{formatDate(active.timestamps.calledAt)}</strong></div>
        </div>
        {active.status === "called" && <div className="operational-action-panel">
          <p className="local-note">Confirme a chegada do paciente ao consultório para iniciar o atendimento.</p>
          <button type="button" className="local-primary" onClick={() => void startCare()} disabled={busy !== ""}>{busy === "starting" ? "Iniciando…" : "Iniciar atendimento"} <ArrowRight size={16} aria-hidden="true" /></button>
        </div>}
        {active.status === "in_progress" && <>
          {!showForm && <div className="operational-action-panel"><p className="local-note">Ao finalizar, salve a prescrição e encerre o atendimento na mesma operação.</p>
            <button type="button" className="local-primary" onClick={() => setShowForm(true)}><ClipboardCheck size={17} aria-hidden="true" /> Prescrever e finalizar</button></div>}
          {showForm && <form onSubmit={e => void complete(e)} className="operational-prescription" aria-label="Finalização do atendimento">
            <div className="operational-row"><h3>Prescrição e finalização</h3><span className="local-note">Campos obrigatórios marcados com *</span></div>
            <div className="local-fields"><label className="local-wide">Descrição / conduta clínica *<textarea required maxLength={5000} rows={4} value={description} onChange={e => { setDescription(e.target.value); setReview(false); }} placeholder="Descreva a conduta do atendimento" /></label></div>
            <div className="operational-row"><h3>Medicamentos</h3>
              <button type="button" className="local-secondary-button operational-small-button" disabled={medications.length >= 50 || busy !== ""} onClick={() => { setMedications(list => [...list, { ...BLANK_MEDICATION }]); setReview(false); }}><Plus size={16} aria-hidden="true" /> Adicionar medicamento</button></div>
            {medications.map((m, i) => <fieldset className="operational-medication" key={i}>
              <legend>Medicamento {i + 1}</legend>
              <div className="local-fields">
                <label>Nome *<input required maxLength={150} value={m.name} onChange={e => medication(i, "name", e.target.value)} /></label>
                <label>Dosagem *<input required maxLength={150} value={m.dosage} onChange={e => medication(i, "dosage", e.target.value)} /></label>
                <label className="local-wide">Instruções *<textarea required maxLength={1000} rows={2} value={m.instructions} onChange={e => medication(i, "instructions", e.target.value)} /></label>
              </div>
              {medications.length > 1 && <button type="button" className="operational-inline operational-danger" onClick={() => { setMedications(list => list.filter((_, index) => index !== i)); setReview(false); }}><Trash2 size={14} aria-hidden="true" /> Remover medicamento</button>}
            </fieldset>)}
            <div className="local-fields"><label className="local-wide">Orientações adicionais<textarea maxLength={4000} rows={3} value={notes} onChange={e => { setNotes(e.target.value); setReview(false); }} /></label></div>
            {review && <div className="operational-confirm" role="group" aria-label="Revisão da finalização">
              <strong>Revisar antes de finalizar</strong><p>Você vai encerrar o atendimento de <strong>{active.patient.fullName}</strong> e gravar uma prescrição com {medications.length} medicamento(s). Confirme antes de prosseguir.</p>
              <p className="local-note">O servidor registra prescrição e finalização de forma atômica. Nenhum e-mail é enviado.</p>
            </div>}
            <div className="local-actions">
              <button className="local-primary" type="submit" disabled={busy !== "" || !valid()}>{busy === "finishing" ? "Salvando prescrição…" : review ? "Confirmar finalização" : "Revisar e finalizar"}</button>
              <button className="local-secondary-button" type="button" disabled={busy !== ""} onClick={() => { setReview(false); setShowForm(false); }}>Voltar ao atendimento</button>
            </div>
          </form>}
        </>}
      </>}
      {!restoring && !active && <div className="operational-ready">
        <div className="operational-ready-icon"><UserRound size={24} aria-hidden="true" /></div>
        <div><h3>Nenhum paciente em atendimento nesta sessão</h3><p>Quando o próximo paciente for chamado, as informações aparecerão aqui.</p></div>
        <Link className="local-secondary-button" to="/medico/fila">Consultar fila <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>}
    </section>}
  </div></AppShell>;
}

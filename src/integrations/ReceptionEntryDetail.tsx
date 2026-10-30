import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { useAuth } from "../auth/context";
import { useToast } from "../components/useToast";
import { ReassessmentHistory } from "../components/ReassessmentHistory";
import { operations, type Doctor, type EntryDetail } from "./operational-api";
import { RiskPill, StatePill } from "./shared-ui";
import { errorText, formatDate } from "./shared-helpers";
import "./local.css";
import "./operations.css";

export function ReceptionEntryDetail() {
  usePageTitle("Detalhes do atendimento");
  const { entryId } = useParams<{entryId:string}>();
  const toast = useToast();
  const {state} = useAuth();
  const user = state.status === "authenticated" ? state.user : null;
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(async (signal:AbortSignal) => {
    if (!entryId) throw new Error("Atendimento não informado.");
    const result = await operations.entry(entryId, signal);
    if (signal.aborted) return;
    setEntry(result); setDoctorId(result.assignedDoctorId ?? "");
    const available = await operations.doctors({pageSize:100},signal).catch(()=>null);
    if (!signal.aborted && available) setDoctors(available.items);
  },[entryId]);
  useEffect(()=>{
    const ctrl=new AbortController();
    const initial=window.setTimeout(()=>{
      void refresh(ctrl.signal).then(()=>{if(!ctrl.signal.aborted)setError("");})
        .catch(cause=>{if(!ctrl.signal.aborted)setError(errorText(cause));})
        .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    },0);
    return ()=>{window.clearTimeout(initial);ctrl.abort();};
  },[refresh,revision]);
  async function act(action:"assign"|"cancel") {
    if (!entry || busy) return;
    setBusy(true);setError("");
    try {
      if(action==="assign") {
        if(!doctorId)return;
        await operations.assignDoctor(entry.id,doctorId);
        toast.success("Médico atribuído");
      } else {
        await operations.setStatus(entry.id,"cancelled");
        toast.success("Desistência registrada");
      }
      setConfirmCancel(false);setRevision(v=>v+1);
    } catch (cause) {
      setError(errorText(cause));toast.error("Não foi possível atualizar o atendimento",errorText(cause));
      setRevision(v=>v+1);
    } finally {setBusy(false);}
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Recepção · Atendimento</span><h1>Detalhes do paciente</h1>
      <p>Informações do atendimento selecionado na fila.</p></div><Link className="local-secondary-button" to="/recepcao">Voltar à fila</Link>
    </header>
    {loading && <p role="status">Carregando atendimento…</p>}
    {error && <div className="local-form"><p role="alert" className="local-message is-error">{error}</p><button className="local-secondary-button" type="button" onClick={()=>{setLoading(true);setRevision(v=>v+1);}}>Tentar novamente</button></div>}
    {entry && <section className="local-form operational-detail" aria-label="Detalhes do atendimento">
      <div className="operational-row operational-detail-head"><div><strong>{entry.patient.fullName}</strong>
        <small>Entrada {formatDate(entry.enteredAt)} · Senha {entry.queueCode || "ainda não atribuída"}</small></div><StatePill status={entry.status}/></div>
      <div className="operational-detail-grid">
        <div><span>Classificação</span><RiskPill value={entry.severity}/></div>
        <div><span>Posição na fila</span><strong>{entry.queuePosition??"—"}</strong></div>
        <div><span>Médico responsável</span><strong>{entry.doctor?.name??"Ainda não atribuído"}</strong></div>
        <div><span>Queixa relatada</span><strong>{entry.otherSymptoms||"Não informada"}</strong></div>
      </div>
      {entry.status==="waiting" && <div className="operational-action-panel"><label className="operational-label">Médico disponível
        <select value={doctorId} onChange={event=>setDoctorId(event.target.value)} disabled={busy}><option value="">Selecione</option>{doctors.map(d=><option value={d.id} key={d.id}>{d.name} · {d.specialty.name}</option>)}</select></label>
        <div className="local-actions"><button type="button" className="local-primary" disabled={!doctorId||busy||doctorId===entry.assignedDoctorId} onClick={()=>void act("assign")}>Salvar médico</button>
          <button type="button" className="local-secondary-button operational-danger" disabled={busy} onClick={()=>setConfirmCancel(true)}>Registrar desistência</button></div>
      </div>}
      {entry.status==="called" && <button className="local-secondary-button operational-danger" type="button" disabled={busy} onClick={()=>setConfirmCancel(true)}>Registrar desistência</button>}
      {confirmCancel && <div className="operational-confirm" role="group" aria-label="Confirmação de desistência"><p>O paciente sairá da fila de espera. O registro será preservado.</p>
        <div className="local-actions"><button type="button" className="local-secondary-button operational-danger" disabled={busy} onClick={()=>void act("cancel")}>Confirmar desistência</button>
          <button type="button" className="local-secondary-button" disabled={busy} onClick={()=>setConfirmCancel(false)}>Manter na fila</button></div></div>}
      <ReassessmentHistory key={entry.id} entryId={entry.id} user={user} revision={entry.updatedAt}/>
    </section>}
  </div></AppShell>;
}

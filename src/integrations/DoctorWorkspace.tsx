import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, ClipboardList, Clock3, Plus, RefreshCw, Stethoscope, Trash2, UserRound } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { useAuth } from "../auth/context";
import { getDoctorQueue, type DoctorItem } from "./client";
import { operations, type EntryDetail, type Medication, type Prescription } from "./operational-api";
import { errorText, formatDate } from "./shared-helpers";
import { RiskPill, StatePill } from "./shared-ui";
import "./local.css";
import "./operations.css";

const BLANK_MEDICATION: Medication = { name:"",dosage:"",instructions:"" };
function cacheKey(userId: string) { return "av:active-entry:"+userId; }

export function DoctorWorkspace() {
  usePageTitle("Consultório médico");
  const {state} = useAuth();
  const doctorName = state.status==="authenticated" ? state.user.name : "Médico";
  const userId = state.status==="authenticated" ? state.user.id : "";
  const [queue,setQueue] = useState<DoctorItem[]>([]);
  const [queueError,setQueueError] = useState("");
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<""|"calling"|"starting"|"finishing">("");
  const [active,setActive] = useState<EntryDetail|null>(null);
  const [entryError,setEntryError] = useState("");
  const [notice,setNotice] = useState("");
  const [description,setDescription] = useState("");
  const [medications,setMedications] = useState<Medication[]>([{...BLANK_MEDICATION}]);
  const [notes,setNotes] = useState("");
  const [review,setReview] = useState(false);
  const [showForm,setShowForm] = useState(false);
  const ongoing=useRef<AbortController|null>(null);
  const lock=useRef(false);

  const refresh=useCallback(async(initial=false)=>{
    ongoing.current?.abort();const controller=new AbortController();ongoing.current=controller;
    if(initial)setLoading(true);
    try {
      const result=await getDoctorQueue(controller.signal);
      if(!controller.signal.aborted){setQueue(result);setQueueError("");}
    }catch(cause){if(!controller.signal.aborted)setQueueError(errorText(cause));}
    finally{if(!controller.signal.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{
    const init=window.setTimeout(()=>void refresh(true),0);
    const timer=window.setInterval(()=>void refresh(),30000);
    return()=>{window.clearTimeout(init);window.clearInterval(timer);ongoing.current?.abort();};
  },[refresh]);
  useEffect(()=>{
    if(!userId)return;
    const stored=sessionStorage.getItem(cacheKey(userId));
    if(!stored)return;
    let cancelled=false;
    void operations.entry(stored).then(detail=>{
      if(cancelled)return;
      if(detail.status==="called" || detail.status==="in_progress")setActive(detail);
      else sessionStorage.removeItem(cacheKey(userId));
    }).catch(()=>{
      if(!cancelled){sessionStorage.removeItem(cacheKey(userId));}
    });
    return()=>{cancelled=true;};
  },[userId]);

  async function callNext(){
    if(lock.current || active)return;
    lock.current=true;setBusy("calling");setEntryError("");setNotice("");
    try{
      const result=await operations.callNext();
      if(result){
        setActive(result);setShowForm(false);setReview(false);
        if(userId)sessionStorage.setItem(cacheKey(userId),result.id);
        setNotice("Paciente chamado com sucesso. Confirme o início quando ele estiver no consultório.");
      }else setNotice("Sua fila está vazia no momento. Nenhum paciente foi chamado.");
      await refresh();
    }catch(cause){setEntryError(errorText(cause));}
    finally{setBusy("");lock.current=false;}
  }
  async function startCare(){
    if(lock.current || !active || active.status!=="called")return;
    lock.current=true;setBusy("starting");setEntryError("");setNotice("");
    try{
      const updated=await operations.setStatus(active.id,"in_progress");
      setActive(updated);setNotice("Atendimento iniciado e registrado no servidor.");
    }catch(cause){
      setEntryError(errorText(cause));
      try{setActive(await operations.entry(active.id));}catch{/* Keep clinical error visible. */}
    }finally{lock.current=false;setBusy("");}
  }
  function medication(index:number,key:keyof Medication,value:string){
    setMedications(old=>old.map((item,i)=>i===index?{...item,[key]:value}:item));setReview(false);
  }
  function clearForm(){setDescription("");setNotes("");setMedications([{...BLANK_MEDICATION}]);setReview(false);setShowForm(false);}
  function valid() {
    return description.trim().length>=1 && description.trim().length<=5000 &&
      medications.length>=1 && medications.length<=50 &&
      medications.every(m=>m.name.trim().length>0 && m.name.trim().length<=150 &&
        m.dosage.trim().length>0 && m.dosage.trim().length<=150 &&
        m.instructions.trim().length>0 && m.instructions.trim().length<=1000) &&
      notes.length<=4000;
  }
  async function complete(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!active || active.status!=="in_progress" || lock.current || !valid())return;
    if(!review){setReview(true);return;}
    lock.current=true;setBusy("finishing");setEntryError("");setNotice("");
    const prescription:Prescription = {
      description:description.trim(),
      medications:medications.map(m=>({name:m.name.trim(),dosage:m.dosage.trim(),instructions:m.instructions.trim()})),
      ...(notes.trim()?{notes:notes.trim()}:{}),
    };
    try{
      await operations.complete(active.id,prescription);
      if(userId)sessionStorage.removeItem(cacheKey(userId));
      setActive(null);clearForm();
      setNotice("Atendimento finalizado e prescrição salva com sucesso.");
      await refresh();
    }catch(cause){
      setReview(false);setEntryError(errorText(cause));
      try{
        const current=await operations.entry(active.id);
        if(current.status==="completed"){
          if(userId)sessionStorage.removeItem(cacheKey(userId));
          setActive(null);clearForm();
          setNotice("O servidor confirmou que o atendimento está finalizado. Não envie a prescrição novamente.");
        }else setActive(current);
      }catch{/* Keep error without attempting a second prescription. */}
    }finally{lock.current=false;setBusy("");}
  }

  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div>
      <span className="local-eyebrow">Pronto-socorro · Atendimento médico</span>
      <h1>Consultório médico</h1><p>Olá, {doctorName}. Chame os pacientes da sua fila e registre cada etapa do atendimento no servidor.</p>
    </div><button type="button" className="local-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/> Atualizar fila</button></header>
    {notice && <p className="local-message is-success" role="status"><CheckCircle2 size={17}/>{notice}</p>}
    {entryError && <div role="alert" className="local-message is-error">{entryError}
      {!active && <p className="local-note">Se você já chamou um paciente em outro navegador, é preciso concluir esse atendimento antes de chamar outro. A API ainda não permite localizar automaticamente um atendimento ativo.</p>}
    </div>}
    <div className="operational-summary">
      <div className="operational-kpi"><span>Pacientes em sua fila</span><strong>{loading?"—":queue.length}</strong><small>Ordenados por prioridade e chegada</small></div>
      <div className="operational-kpi"><span>Seu atendimento</span><strong className="operational-time">{active ? (active.status==="called"?"Chamado":"Em andamento") : "Disponível"}</strong><small>{active ? "Finalize o atendimento antes de chamar outro." : "Pronto para chamar próximo paciente."}</small></div>
    </div>
    <section className="local-form operational-current" aria-label="Paciente atual">
      <div className="operational-row"><h2><Stethoscope size={19} aria-hidden="true"/> Paciente atual</h2>{active && <StatePill status={active.status}/>}</div>
      {active ? <>
        <div className="operational-patient">
          <div><span className="local-eyebrow">Paciente</span><h3>{active.patient.fullName}</h3><p className="local-note">{active.queueCode || "Sem senha"} · Chegada {formatDate(active.enteredAt)}</p></div>
          <RiskPill value={active.severity}/>
        </div>
        <div className="operational-detail-grid">
          <div><span>Queixa relatada</span><strong>{active.otherSymptoms || "Não informada"}</strong></div>
          <div><span>Observações de entrada</span><strong>{active.shortNote || "Nenhuma observação"}</strong></div>
          <div><span>Sala</span><strong>{active.room || "Verifique a escala"}</strong></div>
          <div><span>Chamada</span><strong>{formatDate(active.timestamps.calledAt)}</strong></div>
        </div>
        {active.status==="called" && <div className="operational-action-panel">
          <p className="local-note">O paciente foi chamado. Confirme quando ele chegar ao consultório para começar o atendimento.</p>
          <button type="button" className="local-primary" onClick={()=>void startCare()} disabled={busy!==""}>{busy==="starting"?"Iniciando…":"Iniciar atendimento"} <ArrowRight size={16}/></button>
        </div>}
        {active.status==="in_progress" && <>
          {!showForm && <div className="operational-action-panel"><p className="local-note">Quando o atendimento terminar, registre a prescrição e finalize em uma única operação.</p>
            <button type="button" className="local-primary" onClick={()=>setShowForm(true)}><ClipboardCheck size={17}/> Prescrever e finalizar</button></div>}
          {showForm && <form onSubmit={e=>void complete(e)} className="operational-prescription" aria-label="Finalização do atendimento">
            <div className="operational-row"><h3>Prescrição e finalização</h3><span className="local-note">Campos obrigatórios marcados com *</span></div>
            <div className="local-fields"><label className="local-wide">Descrição / conduta clínica *<textarea required maxLength={5000} rows={4} value={description} onChange={e=>{setDescription(e.target.value);setReview(false);}} placeholder="Descreva a conduta do atendimento"/></label></div>
            <div className="operational-row"><h3>Medicamentos</h3><button type="button" className="local-secondary-button operational-small-button" disabled={medications.length>=50 || busy!==""} onClick={()=>{setMedications(list=>[...list,{...BLANK_MEDICATION}]);setReview(false);}}><Plus size={16}/> Adicionar medicamento</button></div>
            {medications.map((m,i)=><fieldset className="operational-medication" key={i}>
              <legend>Medicamento {i+1}</legend>
              <div className="local-fields">
                <label>Nome *<input required maxLength={150} value={m.name} onChange={e=>medication(i,"name",e.target.value)}/></label>
                <label>Dosagem *<input required maxLength={150} value={m.dosage} onChange={e=>medication(i,"dosage",e.target.value)}/></label>
                <label className="local-wide">Instruções *<textarea required maxLength={1000} rows={2} value={m.instructions} onChange={e=>medication(i,"instructions",e.target.value)}/></label>
              </div>
              {medications.length>1 && <button type="button" className="operational-inline operational-danger" onClick={()=>{setMedications(list=>list.filter((_,n)=>n!==i));setReview(false);}}><Trash2 size={14}/> Remover medicamento</button>}
            </fieldset>)}
            <div className="local-fields"><label className="local-wide">Orientações adicionais<textarea maxLength={4000} rows={3} value={notes} onChange={e=>{setNotes(e.target.value);setReview(false);}}/></label></div>
            {review && <div className="operational-confirm" role="group" aria-label="Revisão da finalização">
              <strong>Revisar antes de finalizar</strong><p>Você está prestes a encerrar o atendimento de <strong>{active.patient.fullName}</strong> e gravar uma prescrição com {medications.length} medicamento(s). Esta operação não pode ser desfeita.</p>
              <p className="local-note">A API registra a prescrição e a finalização juntas. Não envia e-mail.</p></div>}
            <div className="local-actions">
              <button className="local-primary" type="submit" disabled={busy!=="" || !valid()}>{busy==="finishing"?"Salvando prescrição…":review?"Confirmar finalização":"Revisar e finalizar"}</button>
              <button className="local-secondary-button" type="button" disabled={busy!==""} onClick={()=>{setReview(false);setShowForm(false);}}>Voltar ao atendimento</button>
            </div>
          </form>}
        </>}
      </> : <div className="operational-ready">
        <div className="operational-ready-icon"><UserRound size={24} aria-hidden="true"/></div>
        <div><h3>Nenhum paciente em atendimento nesta sessão</h3><p>O sistema chamará o próximo paciente elegível da sua fila, respeitando a prioridade clínica.</p></div>
        <button type="button" className="local-primary" onClick={()=>void callNext()} disabled={busy!=="" || loading || queue.length===0}>{busy==="calling"?"Chamando…":"Chamar próximo paciente"} <ArrowRight size={16}/></button>
      </div>}
    </section>
    <section className="local-form" aria-labelledby="doctor-queue-heading">
      <div className="operational-row"><h2 id="doctor-queue-heading"><ClipboardList size={18} aria-hidden="true"/> Minha fila</h2><span className="local-note">Atualização automática a cada 30 segundos</span></div>
      {queueError && <p className="local-message is-error" role="alert">{queueError}</p>}
      {loading && <p className="local-note" role="status">Carregando fila médica…</p>}
      {!loading && !queueError && queue.length===0 && <div className="local-empty"><Clock3 size={22} aria-hidden="true"/><h3>Nenhum paciente aguardando</h3><p>Entradas atribuídas ao seu plantão aparecerão aqui.</p></div>}
      {!loading && !queueError && queue.length>0 && <div className="local-table-wrap"><table className="local-table"><thead><tr>
        <th scope="col">Paciente</th><th scope="col">Classificação</th><th scope="col">Chegada</th><th scope="col">Sintomas</th>
      </tr></thead><tbody>{queue.map(item=><tr key={item.entryId}>
        <td><strong>{item.fullName}</strong><small className="local-secondary">{item.queueCode || "Sem senha"}</small></td>
        <td><RiskPill value={item.severity}/></td><td>{formatDate(item.enteredAt)}</td>
        <td>{[...item.symptoms.map(s=>s.name),item.otherSymptoms].filter(Boolean).join("; ") || "Não informado"}</td>
      </tr>)}</tbody></table></div>}
      <p className="local-note"><AlertCircle size={14} aria-hidden="true"/> A ordem de chamada é definida no backend. Apenas um atendimento ativo por médico.</p>
    </section>
  </div></AppShell>;
}

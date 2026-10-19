import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronLeft, ClipboardList, RefreshCw, Search, UserPlus, XCircle } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { createPatient, getWaitingQueue, type WaitingItem } from "./client";
import { operations, type Doctor, type EntryDetail, type Patient, type Severity } from "./operational-api";
import { errorText, formatDate, RiskPill, StatePill } from "./shared-ui";
import "./local.css";
import "./operations.css";

export function ReceptionWorkspace() {
  usePageTitle("Recepção · Fila de espera");
  const [items, setItems] = useState<WaitingItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
      if (!controller.signal.aborted) setError(errorText(cause));
    } finally {
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(true), 0);
    const interval = window.setInterval(() => void load(), 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); ongoing.current?.abort(); };
  }, [load]);
  const visible = useMemo(() => items.filter(i => [i.fullName, i.queueCode ?? ""].some(s =>
    s.toLocaleLowerCase("pt-BR").includes(filter.trim().toLocaleLowerCase("pt-BR")))), [items, filter]);

  async function openDetails(id: string) {
    setDetailsBusy(true); setSelected(null); setDetailError(""); setNotice(""); setConfirmCancel(false);
    try {
      const [entry, physicians] = await Promise.all([operations.entry(id), operations.doctors({ pageSize: 100 })]);
      setSelected(entry); setDoctors(physicians.items); setDoctorId(entry.doctor?.id ?? "");
    } catch (cause) { setDetailError(errorText(cause)); }
    finally { setDetailsBusy(false); }
  }
  async function act(action: "assign" | "cancel") {
    if (!selected || actionBusy) return;
    setActionBusy(true); setDetailError(""); setNotice("");
    try {
      if (action === "assign") {
        if (!doctorId) return;
        await operations.assignDoctor(selected.id, doctorId);
        setNotice("Médico atribuído com sucesso. A fila dele já pode ser consultada.");
      } else {
        await operations.setStatus(selected.id, "cancelled");
        setNotice("Saída da fila registrada no servidor.");
      }
      const id = selected.id;
      setConfirmCancel(false);
      if (action === "cancel") { setSelected(null); }
      else setSelected(await operations.entry(id));
      await load();
    } catch (cause) {
      setDetailError(errorText(cause));
      // On conflicts, do not keep offering an outdated action as if it could succeed.
      try { setSelected(await operations.entry(selected.id)); } catch { /* Retain error. */ }
    } finally { setActionBusy(false); }
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head">
      <div><span className="local-eyebrow">Recepção · Atendimento imediato</span>
        <h1>Fila de espera</h1>
        <p>Consulte pacientes em espera, confira seus dados e atribua o médico de plantão. A chamada é feita exclusivamente pelo médico.</p></div>
      <Link className="local-primary" to="/novo-cadastro"><UserPlus size={17} aria-hidden="true"/> Cadastrar paciente</Link>
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
    {notice && <p className="local-message is-success" role="status">{notice}</p>}
    {error && <p className="local-message is-error" role="alert">{error} <button type="button" className="operational-inline" onClick={()=>void load()}>Tentar novamente</button></p>}
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
      {detailError && <p role="alert" className="local-message is-error">{detailError}</p>}
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
    <div className="local-bottom"><Link to="/novo-cadastro" className="local-secondary-button"><UserPlus size={16}/> Novo atendimento</Link>
      <p className="local-note">O painel mostra somente os pacientes aguardando. Estados clínicos completos aparecem no detalhe individual.</p></div>
  </div></AppShell>;
}

type NewPatient = { fullName: string; cpf: string; birthDate: string; email: string; phone: string };
const EMPTY: NewPatient = { fullName:"",cpf:"",birthDate:"",email:"",phone:"" };
export function PatientWorkspace() {
  usePageTitle("Cadastro e entrada do paciente");
  const [mode,setMode] = useState<"search"|"new">("search");
  const [search,setSearch] = useState("");
  const [results,setResults] = useState<Patient[]>([]);
  const [searching,setSearching] = useState(false);
  const [searchError,setSearchError] = useState("");
  const [patient,setPatient] = useState(EMPTY);
  const [chosen,setChosen] = useState<{id:string;name:string}|null>(null);
  const [severity,setSeverity] = useState<Severity>("VERDE");
  const [symptoms,setSymptoms] = useState("");
  const [note,setNote] = useState("");
  const [doctors,setDoctors] = useState<Doctor[]>([]);
  const [doctorId,setDoctorId] = useState("");
  const [entryId,setEntryId] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const lock = useRef(false);
  const searched = search.trim();
  useEffect(()=>{
    if (chosen || mode!=="search" || searched.length<2) return;
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      setSearching(true);setSearchError("");
      const cpf=searched.replace(/\D/g,"");
      const filter=cpf.length===11 && /^[\d.\-\s]+$/.test(searched) ? {cpf:searched,pageSize:10} : {name:searched,pageSize:10};
      void operations.patients(filter,controller.signal).then(page=>setResults(page.items))
        .catch(cause=>{if(!controller.signal.aborted)setSearchError(errorText(cause));})
        .finally(()=>{if(!controller.signal.aborted)setSearching(false);});
    },350);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[mode,searched,chosen]);
  useEffect(()=>{
    if(!chosen)return;
    const ctrl=new AbortController();
    const timer=window.setTimeout(()=>{void operations.doctors({pageSize:100},ctrl.signal).then(p=>setDoctors(p.items)).catch(cause=>{if(!ctrl.signal.aborted)setError(errorText(cause));});},0);
    return()=>{window.clearTimeout(timer);ctrl.abort();};
  },[chosen]);
  async function savePatient(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(lock.current)return;
    lock.current=true;setBusy(true);setError("");
    try {
      const saved=await createPatient({
        fullName:patient.fullName.trim(),cpf:patient.cpf.replace(/\D/g,""),
        ...(patient.birthDate?{birthDate:patient.birthDate}:{}),
        ...(patient.email.trim()?{email:patient.email.trim()}:{}),
        ...(patient.phone.trim()?{phone:patient.phone.trim()}:{}),
      });
      setChosen({id:saved.id,name:saved.fullName});
    } catch(cause){setError(errorText(cause));}
    finally{lock.current=false;setBusy(false);}
  }
  async function saveEntry(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!chosen || !symptoms.trim() || lock.current)return;
    lock.current=true;setBusy(true);setError("");
    try{
      const entry=await operations.createEntry({
        patientId:chosen.id,severity,symptomIds:[],otherSymptoms:symptoms.trim(),
        ...(note.trim()?{shortNote:note.trim()}:{}),
        ...(doctorId?{assignedDoctorId:doctorId}:{}),
      });
      setEntryId(entry.id);
    }catch(cause){setError(errorText(cause));}
    finally{lock.current=false;setBusy(false);}
  }
  function restart(){
    setMode("search");setSearch("");setResults([]);setPatient(EMPTY);setChosen(null);
    setSeverity("VERDE");setSymptoms("");setNote("");setDoctorId("");setEntryId("");setError("");
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Recepção · Entrada no pronto-socorro</span>
      <h1>Cadastro e entrada</h1><p>Primeiro identifique a pessoa, depois registre o motivo da vinda e o médico de plantão.</p></div>
      <Link className="local-secondary-button" to="/recepcao"><ChevronLeft size={16}/> Voltar à fila</Link></header>
    <div className="local-steps" aria-label="Etapas do atendimento">
      <span className={chosen?"is-done":"is-current"}>1. Identificação</span>
      <span className={entryId?"is-done":chosen?"is-current":""}>2. Entrada na fila</span>
    </div>
    {error && <p role="alert" className="local-message is-error">{error}</p>}
    {!chosen && mode==="search" && <section className="local-form">
      <h2>Encontrar paciente</h2>
      <p className="local-note">Pesquise um cadastro já existente antes de criar outro. Não é necessário informar UUID.</p>
      <label className="local-search">Buscar paciente por nome ou CPF
        <input autoFocus type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Digite pelo menos 2 caracteres" /></label>
      {searching && <p role="status" className="local-note">Pesquisando no cadastro…</p>}
      {searchError && <p role="alert" className="local-message is-error">{searchError}</p>}
      {searched.length>=2 && !searching && !searchError && results.length===0 && <p className="local-note">Nenhum cadastro encontrado. Confira os dados ou crie um paciente.</p>}
      {results.length>0 && <div className="operational-result-list" aria-label="Pacientes encontrados">
        {results.map(item=><button type="button" className="operational-result" key={item.id} onClick={()=>{setChosen({id:item.id,name:item.fullName});setError("");}}>
          <span><strong>{item.fullName}</strong><small>CPF terminando em {item.cpf.slice(-4)}</small></span><ArrowRight size={18} aria-hidden="true"/></button>)}
      </div>}
      <div className="local-actions"><button className="local-secondary-button" type="button" onClick={()=>{setMode("new");setError("");}}><UserPlus size={16}/> Novo paciente</button></div>
    </section>}
    {!chosen && mode==="new" && <form className="local-form" onSubmit={e=>void savePatient(e)}>
      <div className="operational-row"><h2>Novo paciente</h2><button type="button" className="operational-inline" onClick={()=>{setMode("search");setError("");}}>Buscar existente</button></div>
      <div className="local-fields">
        <label>Nome completo *<input required autoComplete="name" maxLength={150} value={patient.fullName} onChange={e=>setPatient(v=>({...v,fullName:e.target.value}))}/></label>
        <label>CPF *<input required inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={patient.cpf} onChange={e=>setPatient(v=>({...v,cpf:e.target.value}))}/></label>
        <label>Data de nascimento<input type="date" value={patient.birthDate} onChange={e=>setPatient(v=>({...v,birthDate:e.target.value}))}/></label>
        <label>Telefone<input type="tel" maxLength={20} value={patient.phone} onChange={e=>setPatient(v=>({...v,phone:e.target.value}))}/></label>
        <label className="local-wide">E-mail<input type="email" maxLength={255} value={patient.email} onChange={e=>setPatient(v=>({...v,email:e.target.value}))}/></label>
      </div>
      <div className="local-actions"><button type="submit" disabled={busy || !patient.fullName.trim() || patient.cpf.replace(/\D/g,"").length!==11} className="local-primary">
        {busy?"Salvando…":"Continuar para entrada"} <ArrowRight size={16}/></button></div>
    </form>}
    {chosen && !entryId && <form className="local-form" onSubmit={e=>void saveEntry(e)}>
      <div className="operational-row"><div><h2>Registrar entrada</h2><p className="local-note">Paciente selecionado: <strong>{chosen.name}</strong></p></div>
      <button type="button" className="local-secondary-button operational-small-button" onClick={()=>setChosen(null)} disabled={busy}>Trocar paciente</button></div>
      <div className="local-fields">
        <label>Classificação informada pela recepção *<select value={severity} onChange={e=>setSeverity(e.target.value as Severity)}>
          <option value="VERDE">Verde · Baixa prioridade</option><option value="AMARELO">Amarelo · Atenção</option><option value="VERMELHO">Vermelho · Urgente</option></select></label>
        <label>Médico de plantão<select value={doctorId} onChange={e=>setDoctorId(e.target.value)}>
          <option value="">Atribuir mais tarde</option>{doctors.map(d=><option value={d.id} key={d.id}>{d.name} · {d.specialty.name}{d.shift.room?" · "+d.shift.room:""}</option>)}</select></label>
        <label className="local-wide">Sintomas / queixa relatada *<textarea required maxLength={2000} rows={4} value={symptoms} onChange={e=>setSymptoms(e.target.value)} placeholder="Descreva a queixa informada pela pessoa" /></label>
        <label className="local-wide">Observações adicionais<textarea maxLength={500} rows={2} value={note} onChange={e=>setNote(e.target.value)}/></label>
      </div>
      <p className="local-note">Classificação registrada manualmente; não há triagem automática. Sem médico atribuído, o paciente não aparece na fila individual de um profissional.</p>
      <div className="local-actions"><button type="submit" className="local-primary" disabled={busy || !symptoms.trim()}>{busy?"Registrando…":"Confirmar entrada no servidor"}</button></div>
    </form>}
    {entryId && <section className="local-form operational-success" role="status">
      <CheckCircle2 size={37} aria-hidden="true"/><h2>Entrada registrada com sucesso</h2>
      <p>{chosen?.name} está na fila de espera. {doctorId?"O médico atribuído já poderá visualizar a entrada.":"Você poderá atribuir o médico na fila de espera."}</p>
      <div className="local-actions"><Link className="local-primary" to="/recepcao">Consultar fila</Link><button type="button" className="local-secondary-button" onClick={restart}>Novo atendimento</button></div>
    </section>}
  </div></AppShell>;
}

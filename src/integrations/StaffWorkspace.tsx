import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, ShieldAlert, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { createEmployee, type EmployeeRecord } from "./client";
import { operations, type Employee, type Page } from "./operational-api";
import { errorText } from "./shared-helpers";
import "./local.css";
import "./operations.css";

const ROLE_LABEL:Record<EmployeeRecord["role"],string>={ADMIN:"Administrador",MEDICO:"Médico",RECEPCIONISTA:"Recepcionista"};

export function StaffWorkspace({actor}:{actor:"ADMIN"|"RECEPCIONISTA"}) {
  usePageTitle("Gestão de funcionários");
  const [q,setQ]=useState("");
  const [role,setRole]=useState("");
  const [active,setActive]=useState("");
  const [page,setPage]=useState(1);
  const [listing,setListing]=useState<Page<Employee>|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0);
  const [createOpen,setCreateOpen]=useState(false);
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [newRole,setNewRole]=useState<EmployeeRecord["role"]>("MEDICO");
  const [saving,setSaving]=useState(false);
  const lock=useRef(false);
  const load=useCallback(async(signal:AbortSignal)=>{
    if(actor!=="ADMIN")return;
    setLoading(true);setError("");
    try {
      const data=await operations.employees({q:q.trim().length?q.trim():undefined,role:role||undefined,
        active:active||undefined,page,pageSize:10},signal);
      if(!signal.aborted)setListing(data);
    }catch(cause){if(!signal.aborted)setError(errorText(cause));}
    finally{if(!signal.aborted)setLoading(false);}
  },[actor,q,role,active,page]);
  useEffect(()=>{
    if(actor!=="ADMIN")return;
    const controller=new AbortController();
    const timer=window.setTimeout(()=>void load(controller.signal),q?300:0);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[actor,load,revision,q]);
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(lock.current || actor!=="ADMIN")return;
    lock.current=true;setSaving(true);setError("");setNotice("");
    try{
      const newEmployee=await createEmployee({name:name.trim(),email:email.trim(),password,role:newRole});
      setNotice("Conta de "+newEmployee.name+" criada no servidor.");
      setName("");setEmail("");setPassword("");setCreateOpen(false);
      setPage(1);setQ("");setRole("");setActive("");setRevision(i=>i+1);
    }catch(cause){setError(errorText(cause));}
    finally{lock.current=false;setSaving(false);}
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Administração · Gestão de acessos</span><h1>Funcionários</h1>
      <p>Consulte as contas reais por nome, perfil e situação. Senhas não aparecem nas listagens.</p></div>
      {actor==="ADMIN" && <button type="button" className="local-primary" onClick={()=>setCreateOpen(open=>!open)}><UserPlus size={17}/>{createOpen?"Fechar cadastro":"Novo funcionário"}</button>}
    </header>
    {actor!=="ADMIN" ? <section className="local-empty"><ShieldAlert size={28}/><h2>Gestão de funcionários restrita</h2>
      <p>A API permite consultar e cadastrar funcionários somente com perfil administrador.</p>
      <Link className="local-primary" to="/recepcao">Voltar à recepção</Link></section> : <>
      {notice && <p className="local-message is-success" role="status">{notice}</p>}
      {error && <p className="local-message is-error" role="alert">{error}</p>}
      {createOpen && <form className="local-form" onSubmit={e=>void create(e)}>
        <h2>Novo funcionário</h2>
        <div className="local-fields">
          <label>Nome completo *<input required maxLength={150} minLength={2} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>
          <label>E-mail corporativo *<input required type="email" maxLength={150} autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <label>Senha inicial *<input required type="password" autoComplete="new-password" minLength={8} maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)}/></label>
          <label>Perfil *<select value={newRole} onChange={e=>setNewRole(e.target.value as EmployeeRecord["role"])}><option value="MEDICO">Médico</option><option value="RECEPCIONISTA">Recepcionista</option><option value="ADMIN">Administrador</option></select></label>
        </div>
        <p className="local-note">A senha é enviada ao backend somente durante o cadastro e não fica exibida na lista.</p>
        <div className="local-actions"><button className="local-primary" type="submit" disabled={saving || !name.trim() || !email.trim() || password.length<8}>{saving?"Cadastrando…":"Criar conta no backend"} <UserPlus size={16}/></button>
          <button className="local-secondary-button" type="button" onClick={()=>setCreateOpen(false)} disabled={saving}>Cancelar</button></div>
      </form>}
      <section className="local-form">
        <div className="operational-row"><h2><Users size={19} aria-hidden="true"/> Equipe cadastrada</h2>
          <button className="local-secondary-button operational-small-button" type="button" disabled={loading} onClick={()=>setRevision(i=>i+1)}><RefreshCw size={15}/> Atualizar</button></div>
        <div className="operational-filters">
          <label>Pesquisar por nome ou e-mail<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} placeholder="Buscar funcionário"/></label>
          <label>Perfil<select value={role} onChange={e=>{setRole(e.target.value);setPage(1);}}><option value="">Todos</option><option value="MEDICO">Médicos</option><option value="RECEPCIONISTA">Recepcionistas</option><option value="ADMIN">Administradores</option></select></label>
          <label>Situação<select value={active} onChange={e=>{setActive(e.target.value);setPage(1);}}><option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option></select></label>
        </div>
        {loading && <p className="local-message" role="status">Carregando funcionários…</p>}
        {!loading && !error && listing?.items.length===0 && <div className="local-empty"><Users size={24}/><h3>Nenhum funcionário encontrado</h3><p>Experimente limpar os filtros ou cadastrar uma conta.</p></div>}
        {!loading && !error && listing && listing.items.length>0 && <div className="local-table-wrap"><table className="local-table"><thead><tr>
          <th scope="col">Funcionário</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Situação</th>
        </tr></thead><tbody>{listing.items.map(employee=><tr key={employee.id}>
          <td><strong>{employee.name}</strong></td><td>{employee.email}</td><td>{ROLE_LABEL[employee.role]}</td>
          <td><span className={"operational-state "+(employee.active?"is-completed":"is-cancelled")}>{employee.active?"Ativo":"Inativo"}</span></td>
        </tr>)}</tbody></table></div>}
        {listing && !error && <div className="operational-pagination">
          <span>{listing.total} funcionário(s) · Página {listing.page} de {Math.max(1,Math.ceil(listing.total/listing.pageSize))}</span>
          <div className="local-actions"><button type="button" className="local-secondary-button operational-small-button" disabled={page<=1 || loading} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/> Anterior</button>
            <button type="button" className="local-secondary-button operational-small-button" disabled={page*listing.pageSize>=listing.total || loading} onClick={()=>setPage(p=>p+1)}>Próxima <ChevronRight size={16}/></button></div>
        </div>}
      </section>
    </>}
  </div></AppShell>;
}

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EditorDialog } from "../features/clinic/shared";
import { Pencil, Plus } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { useToast } from "../components/useToast";
import { request } from "./client";
import { operations, type Employee, type Page } from "./operational-api";
import { extended, type DoctorProfile, type DoctorShift } from "./extended-api";
import { errorText, formatDate } from "./shared-helpers";
import "./local.css";
import "./operations.css";

type Specialty = { id: string; name: string; active: boolean };
function pageOf<T>(value: unknown): Page<T> {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) throw new Error("A API retornou uma lista inválida.");
  return value as Page<T>;
}
const shiftTime = (value: string) => new Date(value).toLocaleString("pt-BR");

export function DoctorsDirectory() {
  usePageTitle("Médicos");
  const toast = useToast();
  const [listing, setListing] = useState<Page<DoctorProfile> | null>(null);
  const [workers, setWorkers] = useState<Employee[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [nameFilter, setNameFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DoctorProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editError, setEditError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({page:String(page),pageSize:"10"});
    if(nameFilter.trim()) params.set("name",nameFilter.trim());
    if(specialtyFilter) params.set("specialtyId",specialtyFilter);
    if(statusFilter) params.set("active",statusFilter);
    const [doctors, people, areas] = await Promise.all([
      request("/admin/doctors?" + params, "GET", undefined, signal).then(pageOf<DoctorProfile>),
      operations.employees({ role: "MEDICO", page: 1, pageSize: 100 }, signal),
      request("/specialties?page=1&pageSize=100", "GET", undefined, signal).then(pageOf<Specialty>),
    ]);
    if (!signal.aborted) { setListing(doctors); setWorkers(people.items); setSpecialties(areas.items); setError(""); }
  }, [page, nameFilter, specialtyFilter, statusFilter]);
  useEffect(() => {
    const controller = new AbortController();
    const id = window.setTimeout(() => {
      setLoading(true);
      void load(controller.signal).catch(err => { if(!controller.signal.aborted) setError(errorText(err)); })
        .finally(() => { if(!controller.signal.aborted) setLoading(false); });
    }, nameFilter ? 300 : 0);
    return () => { controller.abort(); window.clearTimeout(id); };
  }, [load, revision, nameFilter]);
  const availableAccounts = workers.filter(worker => worker.active && !listing?.items.some(doctor => doctor.userId === worker.id));
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selectedUser || !selectedSpecialty) return;
    setBusy(true); setEditError("");
    try {
      await extended.createDoctor(selectedUser, selectedSpecialty);
      toast.success("Perfil médico cadastrado");
      setSelectedUser(""); setSelectedSpecialty(""); setCreateOpen(false); setRevision(r => r + 1);
    } catch (cause) { setEditError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function edit(doctor: DoctorProfile) {
    setEditError("");
    try {
      const record = await extended.doctor(doctor.id);
      const employee = workers.find(item => item.id === record.userId);
      setSelected(record); setSelectedSpecialty(record.specialtyId); setEditActive(record.active);
      setEditName(employee?.name || record.name); setEditEmail(employee?.email || "");
    } catch (cause) { toast.error("Não foi possível consultar o médico", errorText(cause)); }
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    if(!selectedSpecialty) {setEditError("Selecione uma especialidade.");return;}
    const employee = workers.find(item => item.id === selected.userId);
    if(employee && (!editName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail.trim()))) {
      setEditError("Confira o nome e o e-mail informados.");return;
    }
    setBusy(true); setEditError("");
    try {
      if (employee && (editName.trim() !== employee.name || editEmail.trim() !== employee.email))
        await extended.updateEmployee(employee.id, { name: editName.trim(), email: editEmail.trim() });
      await request("/doctors/" + encodeURIComponent(selected.id), "PATCH", {specialtyId:selectedSpecialty,active:editActive});
      toast.success("Cadastro médico atualizado");setSelected(null);setRevision(v=>v+1);
    } catch(cause) {
      setEditError(errorText(cause) + " Se algum dado da conta já foi alterado, atualize a lista antes de repetir.");
      setRevision(v=>v+1);
    } finally {setBusy(false);}
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Administração · Corpo clínico</span><h1>Médicos</h1>
      <p>Consulte e gerencie os profissionais cadastrados.</p></div>
      <div className="local-actions">
        <Link className="local-secondary-button" to="/admin/novo-funcionario"><Plus size={16} aria-hidden="true" /> Nova conta médica</Link>
        <button type="button" className="local-primary" onClick={() => {setCreateOpen(true);setEditError("");}}><Plus size={16} aria-hidden="true" /> Vincular médico</button>
      </div>
    </header>
    <section className="local-form">
      <div className="operational-row"><h2>Profissionais cadastrados</h2></div>
      <div className="operational-filters">
        <label>Buscar por nome<input type="search" placeholder="Nome do médico" value={nameFilter} onChange={event=>{setNameFilter(event.target.value);setPage(1);}} /></label>
        <label>Especialidade<select value={specialtyFilter} onChange={event=>{setSpecialtyFilter(event.target.value);setPage(1);}}><option value="">Todas</option>{specialties.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        <label>Situação<select value={statusFilter} onChange={event=>{setStatusFilter(event.target.value);setPage(1);}}><option value="">Todas</option><option value="true">Ativos</option><option value="false">Inativos</option></select></label>
      </div>
      {loading && <p role="status">Carregando médicos…</p>}
      {error && <div className="local-empty"><p role="alert">{error}</p><button className="local-secondary-button" onClick={()=>setRevision(v=>v+1)}>Tentar novamente</button></div>}
      {!loading && !error && listing?.items.length === 0 && <div className="local-empty"><h3>Nenhum médico encontrado</h3><p>Revise os filtros ou vincule uma conta médica.</p></div>}
      {!loading && !error && !!listing?.items.length && <div className="local-table-wrap"><table className="local-table">
        <thead><tr><th scope="col">Médico</th><th scope="col">Especialidade</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead>
        <tbody>{listing.items.map(doctor=><tr key={doctor.id}><td><strong>{doctor.name}</strong></td><td>{doctor.specialty?.name||"—"}</td>
          <td><span className={"operational-state "+(doctor.active?"is-completed":"is-cancelled")}>{doctor.active?"Ativo":"Inativo"}</span></td>
          <td><button type="button" className="local-secondary-button" onClick={()=>void edit(doctor)}><Pencil size={15} aria-hidden="true" /> Editar</button></td></tr>)}</tbody>
      </table></div>}
      {!error && listing && <div className="operational-pagination"><span>{listing.total} médico(s) · Página {listing.page} de {Math.max(1,Math.ceil(listing.total/listing.pageSize))}</span>
        <div className="local-actions"><button type="button" className="local-secondary-button" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button>
          <button type="button" className="local-secondary-button" disabled={loading||page*listing.pageSize>=listing.total} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
      </div>}
    </section>
    {selected && <EditorDialog title="Editar médico" busy={busy} onClose={()=>setSelected(null)}>
      <form className="local-form" onSubmit={event=>void update(event)} noValidate>
        <h2>Editar médico</h2>
        <fieldset className="clinic-fieldset" disabled={busy}><div className="local-fields">
          <label>Nome completo *<input value={editName} disabled={!workers.some(worker=>worker.id===selected.userId)} onChange={e=>setEditName(e.target.value)} required /></label>
          <label>E-mail corporativo *<input type="email" value={editEmail} disabled={!workers.some(worker=>worker.id===selected.userId)} onChange={e=>setEditEmail(e.target.value)} required /></label>
          <label>Especialidade *<select required value={selectedSpecialty} onChange={e=>setSelectedSpecialty(e.target.value)}><option value="">Selecione</option>{specialties.filter(area=>area.active||area.id===selectedSpecialty).map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          <label>Situação<select value={String(editActive)} onChange={e=>setEditActive(e.target.value==="true")}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
        </div></fieldset>
        <p className="local-note">O backend permite editar dados da conta e vínculo médico, mas não CRM, telefone ou sala padrão neste cadastro.</p>
        {editError && <p className="local-message is-error" role="alert">{editError}</p>}
        <div className="local-actions"><button className="local-primary" type="submit" disabled={busy}>{busy?"Salvando…":"Salvar alterações"}</button>
          <button type="button" className="local-secondary-button" disabled={busy} onClick={()=>setSelected(null)}>Cancelar</button></div>
      </form>
    </EditorDialog>}
    {createOpen && <EditorDialog title="Vincular médico" busy={busy} onClose={()=>setCreateOpen(false)}>
      <form className="local-form" onSubmit={event=>void create(event)}>
        <h2>Vincular médico</h2><p className="local-note">Selecione uma conta já criada. A especialidade é obrigatória no vínculo, conforme o contrato atual da API.</p>
        <div className="local-fields"><label>Conta médica<select value={selectedUser} required onChange={event=>setSelectedUser(event.target.value)}>
          <option value="">Selecione</option>{availableAccounts.map(user=><option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
        </select></label><label>Especialidade<select value={selectedSpecialty} required onChange={event=>setSelectedSpecialty(event.target.value)}>
          <option value="">Selecione</option>{specialties.filter(area=>area.active).map(area=><option key={area.id} value={area.id}>{area.name}</option>)}
        </select></label></div>
        {editError && <p role="alert" className="local-message is-error">{editError}</p>}
        <div className="local-actions"><button className="local-primary" type="submit" disabled={!selectedUser||!selectedSpecialty||busy}>{busy?"Salvando…":"Vincular"}</button>
          <button className="local-secondary-button" type="button" disabled={busy} onClick={()=>setCreateOpen(false)}>Cancelar</button></div>
      </form>
    </EditorDialog>}
  </div></AppShell>;
}

function DoctorShifts({ doctorId }: { doctorId: string }) {
  const [shifts, setShifts] = useState<DoctorShift[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void extended.shifts(doctorId, controller.signal).then(r => { if (!controller.signal.aborted) { setShifts(r.items); setError(""); } }).catch(err => { if (!controller.signal.aborted) setError(errorText(err)); });
    return () => controller.abort();
  }, [doctorId, revision]);
  return <div><h3>Plantões do profissional</h3>{error && <p role="alert" className="local-message is-error">{error}</p>}
    {shifts.length === 0 && !error && <p className="local-note">Nenhum plantão encontrado.</p>}
    <div className="local-table-wrap"><table className="local-table"><thead><tr><th scope="col">Início</th><th scope="col">Fim</th><th scope="col">Sala</th><th scope="col">Situação</th></tr></thead><tbody>
      {shifts.map(s => <tr key={s.id}><td>{formatDate(s.startsAt)}</td><td>{formatDate(s.endsAt)}</td><td>{s.room || "Não informada"}</td><td>{s.availabilityStatus === "DISPONIVEL" ? "Disponível" : "Indisponível"}</td></tr>)}
    </tbody></table></div>
    <button type="button" className="local-secondary-button" onClick={() => setRevision(i => i + 1)}>Atualizar plantões</button>
    <Link className="local-secondary-button" to={"/admin/plantoes?doctor=" + encodeURIComponent(doctorId)}>Gerenciar plantões</Link>
  </div>;
}

export function DoctorShiftsAdmin() {
  usePageTitle("Plantões médicos");
  const toast = useToast();
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [shifts, setShifts] = useState<DoctorShift[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [room, setRoom] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const ctrl = new AbortController();
    void request("/admin/doctors?page=1&pageSize=100", "GET", undefined, ctrl.signal).then(pageOf<DoctorProfile>)
      .then(data => { if (!ctrl.signal.aborted) setDoctors(data.items); })
      .catch(err => { if (!ctrl.signal.aborted) setError(errorText(err)); });
    return () => ctrl.abort();
  }, [revision]);
  useEffect(() => {
    if (!doctorId) { const timeout = window.setTimeout(() => setShifts([]), 0); return () => window.clearTimeout(timeout); }
    const ctrl = new AbortController();
    void extended.shifts(doctorId, ctrl.signal).then(data => { if (!ctrl.signal.aborted) { setShifts(data.items); setError(""); } }).catch(err => { if (!ctrl.signal.aborted) setError(errorText(err)); });
    return () => ctrl.abort();
  }, [doctorId, revision]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!doctorId || busy || !start || !end) return;
    if (new Date(start) >= new Date(end)) { setError("O término precisa ser posterior ao início."); return; }
    setBusy(true); setError("");
    try {
      await request("/doctors/" + encodeURIComponent(doctorId) + "/shifts", "POST", {
        startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(),
        room: room.trim() || null, availabilityStatus: "DISPONIVEL",
      });
      toast.success("Plantão criado"); setStart(""); setEnd(""); setRoom(""); setRevision(n => n + 1);
    } catch (err) { toast.error("Não foi possível criar plantão", errorText(err)); }
    finally { setBusy(false); }
  }
  async function setAvailability(shift: DoctorShift) {
    if (busy || !window.confirm("Alterar disponibilidade deste plantão?")) return;
    setBusy(true);
    try {
      await request("/doctors/" + encodeURIComponent(doctorId) + "/shifts/" + encodeURIComponent(shift.id), "PATCH", {
        availabilityStatus: shift.availabilityStatus === "DISPONIVEL" ? "INDISPONIVEL" : "DISPONIVEL",
      });
      toast.success("Disponibilidade atualizada"); setRevision(n => n + 1);
    } catch (err) { toast.error("Não foi possível atualizar plantão", errorText(err)); }
    finally { setBusy(false); }
  }
  return <AppShell><div className="local-page operational-page"><header className="local-page-head"><div><span className="local-eyebrow">Administração · Escalas</span>
    <h1>Plantões médicos</h1><p>Configure turnos reais e salas de atendimento. Plantões sobrepostos são rejeitados pelo servidor.</p></div>
    <Link to="/admin/medicos" className="local-secondary-button">Médicos</Link></header>
    <section className="local-form"><label>Médico<select value={doctorId} onChange={e => setDoctorId(e.target.value)}><option value="">Escolha o profissional</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.name} · {d.specialty.name}</option>)}</select></label>
      {error && <p className="local-message is-error" role="alert">{error}</p>}
      {doctorId && <><form onSubmit={e => void submit(e)} className="local-fields">
        <label>Início<input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>Fim<input type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)} /></label>
        <label>Sala ou consultório<input type="text" maxLength={50} placeholder="Ex.: Consultório 02" value={room} onChange={e => setRoom(e.target.value)} /></label>
        <div className="local-actions"><button type="submit" className="local-primary" disabled={busy}>{busy ? "Salvando…" : "Adicionar plantão"}</button></div>
      </form>
      {shifts.length === 0 && <p className="local-note">Nenhum plantão cadastrado para este médico.</p>}
      {shifts.length > 0 && <div className="local-table-wrap"><table className="local-table"><thead><tr><th scope="col">Início</th><th scope="col">Fim</th><th scope="col">Sala</th><th scope="col">Status</th><th scope="col">Ação</th></tr></thead><tbody>
        {shifts.map(s => <tr key={s.id}><td>{shiftTime(s.startsAt)}</td><td>{shiftTime(s.endsAt)}</td><td>{s.room || "Não informada"}</td>
          <td>{s.availabilityStatus === "DISPONIVEL" ? "Disponível" : "Indisponível"}</td><td><button type="button" className="local-secondary-button" disabled={busy} onClick={() => void setAvailability(s)}>{s.availabilityStatus === "DISPONIVEL" ? "Indisponibilizar" : "Reativar"}</button></td></tr>)}
      </tbody></table></div>}</>}
    </section></div></AppShell>;
}

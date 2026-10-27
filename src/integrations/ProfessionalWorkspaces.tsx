import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
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
  usePageTitle("Cadastro médico");
  const toast = useToast();
  const [listing, setListing] = useState<Page<DoctorProfile> | null>(null);
  const [workers, setWorkers] = useState<Employee[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [nameFilter, setNameFilter] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DoctorProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    const [doctors, people, areas] = await Promise.all([
      request("/admin/doctors?page=" + page + "&pageSize=10" + (nameFilter.trim() ? "&name=" + encodeURIComponent(nameFilter.trim()) : ""), "GET", undefined, signal).then(pageOf<DoctorProfile>),
      operations.employees({ role: "MEDICO", active: "true", page: 1, pageSize: 100 }, signal),
      request("/specialties?page=1&pageSize=100", "GET", undefined, signal).then(pageOf<Specialty>),
    ]);
    if (!signal.aborted) { setListing(doctors); setWorkers(people.items); setSpecialties(areas.items.filter(a => a.active)); setError(""); }
  }, [page, nameFilter]);
  useEffect(() => {
    const controller = new AbortController();
    const id = window.setTimeout(() => void load(controller.signal).catch(err => { if (!controller.signal.aborted) setError(errorText(err)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }), nameFilter ? 300 : 0);
    return () => { controller.abort(); window.clearTimeout(id); };
  }, [load, revision, nameFilter]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !selectedUser || !selectedSpecialty) return;
    setBusy(true);
    try {
      const result = await extended.createDoctor(selectedUser, selectedSpecialty);
      toast.success("Perfil médico criado", result.name);
      setSelectedUser(""); setSelectedSpecialty(""); setRevision(r => r + 1);
    } catch (cause) { toast.error("Não foi possível criar o perfil médico", errorText(cause)); }
    finally { setBusy(false); }
  }
  async function deactivate(doctor: DoctorProfile) {
    if (busy || !window.confirm("Inativar " + doctor.name + "? Pacientes ativos precisam ser realocados antes.")) return;
    setBusy(true);
    try {
      await request("/doctors/" + encodeURIComponent(doctor.id), "PATCH", { active: false });
      toast.success("Médico inativado"); setSelected(null); setRevision(r => r + 1);
    } catch (cause) { toast.error("Não foi possível inativar", errorText(cause)); }
    finally { setBusy(false); }
  }
  async function details(id: string) {
    try { setSelected(await extended.doctor(id)); } catch (cause) { toast.error("Não foi possível consultar o médico", errorText(cause)); }
  }
  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head"><div><span className="local-eyebrow">Administração · Corpo clínico</span><h1>Médicos</h1>
      <p>Cadastre o perfil médico após criar uma conta de funcionário com o perfil Médico.</p></div><Link className="local-secondary-button" to="/admin/usuarios">Funcionários</Link></header>
    <section className="local-form">
      <h2>Vincular um médico</h2>
      <form className="local-fields" onSubmit={e => void create(e)}>
        <label>Conta médica ativa<select required value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
          <option value="">Selecione uma conta</option>{workers.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
        </select></label>
        <label>Especialidade<select required value={selectedSpecialty} onChange={e => setSelectedSpecialty(e.target.value)}>
          <option value="">Selecione a especialidade</option>{specialties.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
        </select></label>
        <div className="local-actions"><button className="local-primary" type="submit" disabled={busy || !selectedUser || !selectedSpecialty}>{busy ? "Salvando…" : "Cadastrar perfil médico"}</button></div>
      </form>
      <p className="local-note">O backend verifica se a conta possui perfil Médico, está ativa e ainda não tem perfil profissional. Um vínculo duplicado é rejeitado.</p>
    </section>
    <section className="local-form">
      <div className="operational-row"><h2>Profissionais cadastrados</h2><button type="button" className="local-secondary-button" onClick={() => setRevision(r => r + 1)}>Atualizar</button></div>
      <label>Buscar por nome<input type="search" value={nameFilter} onChange={e => { setNameFilter(e.target.value); setPage(1); }} /></label>
      {loading && <p role="status">Carregando médicos…</p>}
      {error && <p role="alert" className="local-message is-error">{error}</p>}
      {!loading && !error && listing?.items.length === 0 && <p className="local-note">Nenhum médico encontrado.</p>}
      {!loading && !!listing?.items.length && <div className="local-table-wrap"><table className="local-table"><thead><tr><th scope="col">Médico</th><th scope="col">Especialidade</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead><tbody>
        {listing.items.map(doctor => <tr key={doctor.id}><td><strong>{doctor.name}</strong></td><td>{doctor.specialty.name}</td><td>{doctor.active ? "Ativo" : "Inativo"}</td><td>
          <div className="local-actions"><button className="local-secondary-button" onClick={() => void details(doctor.id)}>Detalhes</button>
            {doctor.active && <button className="local-secondary-button" disabled={busy} onClick={() => void deactivate(doctor)}>Inativar</button>}</div></td></tr>)}
      </tbody></table></div>}
      {listing && <div className="operational-pagination"><span>{listing.total} médico(s) · Página {page}</span><div className="local-actions">
        <button type="button" className="local-secondary-button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
        <button type="button" className="local-secondary-button" disabled={page * listing.pageSize >= listing.total} onClick={() => setPage(p => p + 1)}>Próxima</button></div></div>}
    </section>
    {selected && <section className="local-form" aria-label="Detalhe médico"><div className="operational-row"><h2>{selected.name}</h2><button type="button" className="local-secondary-button" onClick={() => setSelected(null)}>Fechar</button></div>
      <p>Especialidade: <strong>{selected.specialty.name}</strong> · {selected.active ? "Ativo" : "Inativo"}</p>
      <DoctorShifts doctorId={selected.id} />
    </section>}
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

import { useId, useState, type FormEvent } from "react";
import { ArrowDownToLine, Search, UserPlus, Users, ClipboardList, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { PriorityBadge } from "../../components/PriorityBadge";
import { RoleSelect } from "../../components/RoleSelect";
import type { Role } from "../../auth/types";
import { canCreateUserWithRole, getAssignableRoles, USER_ROLE_LABELS } from "../../auth/user-management-permissions";
import { getWaitMinutes, sortPatientsByPriorityAndWait, type QueuePatient, type Priority } from "../../reception/types";

export type TeamMember = {
  initials: string;
  name: string;
  registration: string;
  role: string;
  location: string;
  status: string;
};

const PRIORITIES: Record<Priority, string> = {
  urgent: "Urgente",
  alert: "Alerta",
  calm: "Tranquilo",
};

const STATUSES: Record<QueuePatient["status"], string> = {
  waiting: "Aguardando",
  called: "Chamado",
  "in-care": "Em atendimento",
  completed: "Finalizado",
  deleted: "Removido",
};

function groupForRole(role: string) {
  const normalized = role.toLocaleLowerCase("pt-BR");
  if (normalized.includes("médic") || normalized.includes("medic")) return "medico";
  if (normalized.includes("recep")) return "recepcao";
  if (normalized.includes("admin")) return "admin";
  return "outro";
}

export function UsersSection({
  initialUsers,
  actorRole,
}: {
  initialUsers: readonly TeamMember[];
  actorRole: "ADMIN" | "RECEPCIONISTA";
}) {
  const availableRoles = getAssignableRoles(actorRole);
  const roleLabelId = useId();
  const [users, setUsers] = useState<TeamMember[]>(() => initialUsers.map((user) => ({ ...user })));
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [registration, setRegistration] = useState("");
  const [role, setRole] = useState<Role>("MEDICO");
  const [location, setLocation] = useState("");

  const visibleUsers = users.filter(
    (user) => actorRole === "ADMIN" || groupForRole(user.role) !== "admin",
  );
  const filtered = visibleUsers.filter((user) => {
    const text = [user.name, user.registration, user.role, user.location].join(" ").toLocaleLowerCase("pt-BR");
    return text.includes(query.toLocaleLowerCase("pt-BR")) && (roleFilter === "todos" || groupForRole(user.role) === roleFilter);
  });
  const canSubmit =
    canCreateUserWithRole(actorRole, role) &&
    name.trim().length >= 3 &&
    registration.trim().length >= 3 &&
    location.trim().length >= 3 &&
    !users.some((user) => user.registration.toLocaleLowerCase("pt-BR") === registration.trim().toLocaleLowerCase("pt-BR"));

  function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setUsers((current) => [...current, {
      initials: name.trim().split(/\s+/).slice(0, 2).map((word) => word[0].toLocaleUpperCase("pt-BR")).join(""),
      name: name.trim(),
      registration: registration.trim(),
      role: USER_ROLE_LABELS[role], location: location.trim(), status: "Ativo (local)",
    }]);
    setName(""); setRegistration(""); setRole("MEDICO"); setLocation(""); setShowForm(false);
  }

  return (
    <section className="admin-section-page" aria-labelledby="admin-users-title">
      <header className="admin-section-intro">
        <div><p className="admin-section-eyebrow">Gestão de acessos · Demonstração</p><h2 id="admin-users-title">Gestão de Usuários e Equipe</h2><p>Consulte os profissionais, filtre por função e simule a inclusão ou alteração de status.</p></div>
        <button className="admin-section-primary" type="button" onClick={() => setShowForm((open) => !open)} aria-expanded={showForm}><UserPlus size={17} aria-hidden="true" />{showForm ? "Fechar cadastro" : "Adicionar usuário"}</button>
      </header>
      <p className="admin-section-alert" role="note">Dados de demonstração. Inclusões e alterações de status são demonstrações locais e não criam contas, senhas ou permissões no servidor.</p>
      <div className="admin-section-metrics">
        <div className="admin-section-metric"><span>Profissionais listados</span><strong>{visibleUsers.length}</strong></div>
        <div className="admin-section-metric"><span>Ativos nesta simulação</span><strong>{visibleUsers.filter((user) => !user.status.startsWith("Inativo")).length}</strong></div>
        <div className="admin-section-metric"><span>Funções representadas</span><strong>{new Set(visibleUsers.map((user) => groupForRole(user.role))).size}</strong></div>
      </div>
      {showForm && <form className="admin-section-form" onSubmit={addUser}>
        <h3>Novo profissional (simulação)</h3>
        <div className="admin-section-form-grid">
          <label>Nome completo<input value={name} onChange={(event) => setName(event.target.value)} required minLength={3} placeholder="Nome do profissional" /></label>
          <label>Registro / matrícula<input value={registration} onChange={(event) => setRegistration(event.target.value)} required minLength={3} placeholder="Identificador interno" /></label>
          <div className="admin-section-field">
            <span id={roleLabelId}>Função</span>
            <RoleSelect labelId={roleLabelId} options={availableRoles} value={role} onChange={setRole} />
          </div>
          <label>Setor / local<input value={location} onChange={(event) => setLocation(event.target.value)} required minLength={3} placeholder="Ex.: Recepção 01" /></label>
        </div>
        <div className="admin-section-actions"><button className="admin-section-ghost" type="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="admin-section-primary" type="submit" disabled={!canSubmit}>Adicionar à lista local</button></div>
      </form>}
      <div className="admin-section-controls">
        <label className="admin-section-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar profissionais</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, registro ou local" aria-label="Buscar profissionais" /></label>
        <label className="admin-section-filter">Função<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filtrar função"><option value="todos">Todas</option><option value="medico">Médicos</option><option value="recepcao">Recepção</option>{actorRole === "ADMIN" && <option value="admin">Administração</option>}</select></label>
      </div>
      <div className="admin-section-table-scroll"><table className="admin-section-table"><thead><tr><th scope="col">Profissional</th><th scope="col">Função</th><th scope="col">Setor</th><th scope="col">Status</th>{actorRole === "ADMIN" && <th scope="col">Ação local</th>}</tr></thead><tbody>
        {filtered.map((user) => <tr key={user.registration}>
          <td><div className="admin-section-identity"><span className="admin-section-avatar">{user.initials}</span><span><strong>{user.name}</strong><small>{user.registration}</small></span></div></td>
          <td>{user.role}</td><td>{user.location}</td>
          <td><span className={user.status.startsWith("Inativo") ? "admin-section-status is-inactive" : "admin-section-status"}>{user.status}</span></td>
          {actorRole === "ADMIN" && <td><button className="admin-section-link-button" type="button" onClick={() => setUsers((current) => current.map((item) => item.registration === user.registration ? { ...item, status: item.status.startsWith("Inativo") ? "Ativo (local)" : "Inativo (local)" } : item))}>{user.status.startsWith("Inativo") ? "Reativar" : "Desativar"}</button></td>}
        </tr>)}
        {filtered.length === 0 && <tr><td colSpan={actorRole === "ADMIN" ? 5 : 4} className="admin-section-empty">Nenhum profissional encontrado.</td></tr>}
      </tbody></table></div>
      <p className="admin-section-footnote"><Users size={15} aria-hidden="true" />{filtered.length} de {visibleUsers.length} profissionais exibidos</p>
    </section>
  );
}

export function QueueSection({ patients, now }: { patients: readonly QueuePatient[]; now: number }) {
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("todas");
  const [status, setStatus] = useState("ativos");
  const waiting = sortPatientsByPriorityAndWait(patients.filter((patient) => patient.status === "waiting"), now);
  const other = patients.filter((patient) => patient.status !== "waiting" && patient.status !== "deleted");
  const ordered = [...waiting, ...other];
  const filtered = ordered.filter((patient) => {
    const text = [patient.name, patient.ticket, patient.complaint].join(" ").toLocaleLowerCase("pt-BR");
    return text.includes(query.toLocaleLowerCase("pt-BR")) && (priority === "todas" || patient.priority === priority) && (status === "todos" || (status === "ativos" ? ["waiting", "called", "in-care"].includes(patient.status) : patient.status === status));
  });
  return (
    <section className="admin-section-page" aria-labelledby="admin-queue-title">
      <header className="admin-section-intro"><div><p className="admin-section-eyebrow">Operação · Fila compartilhada</p><h2 id="admin-queue-title">Fila de Espera</h2><p>Acompanhe o estado dos pacientes, a classificação e o tempo aguardado.</p></div><Link className="admin-section-primary" to={import.meta.env.DEV ? "/recepcao?dev=recepcionista" : "/recepcao"}>Abrir triagem <span aria-hidden="true">↗</span></Link></header>
      <p className="admin-section-alert" role="note">Fila demonstrativa sincronizada entre abas abertas; não há persistência no banco de dados nem dados clínicos reais.</p>
      <div className="admin-section-metrics">
        <div className="admin-section-metric"><span>Aguardando</span><strong>{waiting.length}</strong></div>
        <div className="admin-section-metric"><span>Urgentes aguardando</span><strong>{waiting.filter((patient) => patient.priority === "urgent").length}</strong></div>
        <div className="admin-section-metric"><span>Em atendimento</span><strong>{patients.filter((patient) => patient.status === "in-care" || patient.status === "called").length}</strong></div>
        <div className="admin-section-metric"><span>Finalizados nesta sessão</span><strong>{patients.filter((patient) => patient.status === "completed").length}</strong></div>
      </div>
      <div className="admin-section-controls">
        <label className="admin-section-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar pacientes</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, senha ou queixa" aria-label="Buscar pacientes" /></label>
        <label className="admin-section-filter">Prioridade<select aria-label="Filtrar prioridade da fila" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="todas">Todas</option><option value="urgent">Urgente</option><option value="alert">Alerta</option><option value="calm">Tranquilo</option></select></label>
        <label className="admin-section-filter">Situação<select aria-label="Filtrar situação da fila" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ativos">Ativos</option><option value="todos">Todos, exceto removidos</option><option value="waiting">Aguardando</option><option value="in-care">Em atendimento</option><option value="completed">Finalizados</option></select></label>
      </div>
      <div className="admin-section-table-scroll"><table className="admin-section-table"><thead><tr><th scope="col">Senha</th><th scope="col">Paciente</th><th scope="col">Idade</th><th scope="col">Classificação</th><th scope="col">Espera</th><th scope="col">Situação</th></tr></thead><tbody>
        {filtered.map((patient) => <tr key={patient.ticket}><td><strong className="admin-section-ticket">{patient.ticket}</strong></td><td><strong>{patient.name}</strong><small className="admin-section-secondary">{patient.complaint}</small></td><td>{patient.age} anos</td><td><PriorityBadge priority={patient.priority} /></td><td>{patient.status === "waiting" ? `${getWaitMinutes(patient, now)} min` : "—"}</td><td><span className="admin-section-status">{STATUSES[patient.status]}</span></td></tr>)}
        {filtered.length === 0 && <tr><td colSpan={6} className="admin-section-empty">Nenhum paciente corresponde aos filtros.</td></tr>}
      </tbody></table></div>
      <p className="admin-section-footnote"><ClipboardList size={15} aria-hidden="true" />Exibindo {filtered.length} de {ordered.length} pacientes</p>
    </section>
  );
}

export function ReportsSection({ patients, now, auditCount, onExport }: { patients: readonly QueuePatient[]; now: number; auditCount: number; onExport: () => void }) {
  const waiting = patients.filter((patient) => patient.status === "waiting");
  const completed = patients.filter((patient) => patient.status === "completed");
  const avgWait = waiting.length ? Math.round(waiting.reduce((total, patient) => total + getWaitMinutes(patient, now), 0) / waiting.length) : 0;
  const priorityCounts = [
    { key: "urgent" as const, count: waiting.filter((patient) => patient.priority === "urgent").length },
    { key: "alert" as const, count: waiting.filter((patient) => patient.priority === "alert").length },
    { key: "calm" as const, count: waiting.filter((patient) => patient.priority === "calm").length },
  ];
  return (
    <section className="admin-section-page" aria-labelledby="admin-reports-title">
      <header className="admin-section-intro"><div><p className="admin-section-eyebrow">Indicadores · Retrato da sessão</p><h2 id="admin-reports-title">Relatórios Operacionais</h2><p>Consulte indicadores da fila demonstrativa e exporte os dados agregados atuais.</p></div><button className="admin-section-primary" type="button" onClick={onExport}><ArrowDownToLine size={17} aria-hidden="true" />Exportar CSV</button></header>
      <p className="admin-section-alert" role="note">Estes números representam somente o estado da demonstração em memória. Não são relatórios históricos, registros oficiais, receitas assinadas ou dados persistidos no servidor.</p>
      <div className="admin-section-metrics">
        <div className="admin-section-metric"><span>Pacientes na espera</span><strong>{waiting.length}</strong></div>
        <div className="admin-section-metric"><span>Espera média atual</span><strong>{avgWait} <small>min</small></strong></div>
        <div className="admin-section-metric"><span>Finalizados nesta sessão</span><strong>{completed.length}</strong></div>
        <div className="admin-section-metric"><span>Eventos auditados na fila</span><strong>{auditCount}</strong></div>
      </div>
      <div className="admin-report-grid">
        <article className="admin-report-panel"><h3>Pacientes aguardando por prioridade</h3><p>Distribuição atual baseada na fila ativa.</p><div className="admin-report-bars">
          {priorityCounts.map(({ key, count }) => <div key={key} className="admin-report-bar-row"><span>{PRIORITIES[key]}</span><div className="admin-report-bar-track"><div className={`admin-report-bar-fill is-${key}`} style={{ width: `${waiting.length ? (count / waiting.length) * 100 : 0}%` }} /></div><strong>{count}</strong></div>)}
        </div></article>
        <article className="admin-report-panel"><h3>Situação da operação</h3><p>Estado dos atendimentos na sessão local.</p>
          <dl className="admin-report-breakdown"><div><dt>Em atendimento</dt><dd>{patients.filter((patient) => patient.status === "in-care" || patient.status === "called").length}</dd></div><div><dt>Na fila</dt><dd>{waiting.length}</dd></div><div><dt>Finalizados</dt><dd>{completed.length}</dd></div><div><dt>Removidos da fila</dt><dd>{patients.filter((patient) => patient.status === "deleted").length}</dd></div></dl>
        </article>
      </div>
      <div className="admin-section-footnote"><Clock3 size={15} aria-hidden="true" />Atualizado às {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(now)} (Brasília). Nenhuma informação clínica é incluída no CSV.</div>
    </section>
  );
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, RefreshCw, ShieldAlert, UserPlus, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { useToast } from "../components/useToast";
import { createEmployee, type EmployeeRecord } from "./client";
import { operations, type Employee, type Page } from "./operational-api";
import { errorText } from "./shared-helpers";
import "./local.css";
import "./operations.css";

const ROLE_LABEL: Record<EmployeeRecord["role"], string> = {
  ADMIN: "Administrador", MEDICO: "Médico", RECEPCIONISTA: "Recepcionista",
};

export function StaffWorkspace({ actor, view = "list" }: { actor: "ADMIN" | "RECEPCIONISTA"; view?: "list" | "create" }) {
  usePageTitle(view === "create" ? "Novo funcionário" : "Gestão de funcionários");
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const [listing, setListing] = useState<Page<Employee> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<EmployeeRecord["role"]>("MEDICO");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const lock = useRef(false);
  const load = useCallback(async (signal: AbortSignal) => {
    if (actor !== "ADMIN" || view !== "list") return;
    setLoading(true); setFailed(false);
    try {
      const data = await operations.employees({
        q: q.trim() || undefined, role: role || undefined, active: active || undefined, page, pageSize: 10,
      }, signal);
      if (!signal.aborted) setListing(data);
    } catch (cause) {
      if (!signal.aborted) {
        setFailed(true);
        toast.error("Não foi possível carregar funcionários", errorText(cause));
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [actor, view, q, role, active, page, toast]);
  useEffect(() => {
    if (actor !== "ADMIN" || view !== "list") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), q ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [actor, view, load, revision, q]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || actor !== "ADMIN" || view !== "create") return;
    if (name.trim().length < 2 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim()) || password.length < 8) {
      setFormError("Preencha o nome, informe um e-mail válido e use uma senha de pelo menos 8 caracteres.");
      return;
    }
    setFormError("");
    lock.current = true; setSaving(true);
    try {
      const created = await createEmployee({ name: name.trim(), email: email.trim(), password, role: newRole });
      setPassword("");
      toast.success("Funcionário cadastrado", newRole === "MEDICO"
        ? "A conta de " + created.name + " foi criada. Agora vincule uma especialidade ao cadastro médico."
        : "Conta de " + created.name + " criada com sucesso.");
      navigate("/admin/usuarios", { replace: true });
    } catch (cause) {
      toast.error("Não foi possível cadastrar o funcionário", errorText(cause));
    } finally { lock.current = false; setSaving(false); }
  }

  if (actor !== "ADMIN") {
    return <AppShell><div className="local-page operational-page">
      <section className="local-empty"><ShieldAlert size={28} aria-hidden="true" />
        <h1>Acesso restrito</h1>
        <p>A gestão de funcionários é exclusiva de administradores.</p>
        <Link className="local-primary" to="/recepcao">Voltar à recepção</Link>
      </section>
    </div></AppShell>;
  }

  if (view === "create") {
    return <AppShell><div className="local-page operational-page">
      <header className="local-page-head">
        <div><span className="local-eyebrow">Administração · Equipe</span><h1>Novo funcionário</h1>
          <p>Preencha os dados para conceder acesso ao pronto-socorro.</p></div>
        <Link className="local-secondary-button" to="/admin/usuarios"><ArrowLeft size={16} aria-hidden="true" /> Voltar aos funcionários</Link>
      </header>
      <form className="local-form operational-single-form" noValidate onSubmit={e => void create(e)}>
        <div><h2>Dados de acesso</h2><p className="local-note">Todos os campos são obrigatórios. Use uma senha temporária segura.</p></div>
        <div className="local-fields">
          <label>Nome completo *<input required minLength={2} maxLength={150} autoComplete="name" autoFocus value={name} onChange={e => setName(e.target.value)} /></label>
          <label>E-mail corporativo *<input required type="email" maxLength={150} autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Senha inicial *<input required type="password" autoComplete="new-password" minLength={8} maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label>Perfil *<select value={newRole} onChange={e => setNewRole(e.target.value as EmployeeRecord["role"])}>
            <option value="MEDICO">Médico</option><option value="RECEPCIONISTA">Recepcionista</option><option value="ADMIN">Administrador</option>
          </select></label>
        </div>
        <p className="local-note">Senha obrigatória: mínimo de 8 caracteres. Ela não será exibida na lista.</p>
        {newRole === "MEDICO" && <p className="local-message" role="note">O perfil Médico cria uma conta de acesso. Para entrar na fila e atender pacientes, será necessário cadastrar o vínculo médico com uma especialidade no módulo Médicos.</p>}
        {formError && <p className="local-message is-error" role="alert">{formError}</p>}
        <div className="local-actions">
          <button className="local-primary" type="submit" disabled={saving}>
            {saving ? "Cadastrando…" : "Cadastrar funcionário"} <UserPlus size={16} aria-hidden="true" />
          </button>
          <Link className="local-secondary-button" to="/admin/usuarios">Cancelar</Link>
        </div>
      </form>
    </div></AppShell>;
  }

  return <AppShell><div className="local-page operational-page">
    <header className="local-page-head">
      <div><span className="local-eyebrow">Administração · Gestão de acessos</span><h1>Funcionários</h1>
        <p>Consulte contas cadastradas, perfis e situação dos colaboradores.</p></div>
      <Link className="local-primary" to="/admin/novo-funcionario"><UserPlus size={17} aria-hidden="true" /> Novo funcionário</Link>
    </header>
    <section className="local-form">
      <div className="operational-row"><h2><Users size={19} aria-hidden="true" /> Equipe cadastrada</h2>
        <button className="local-secondary-button operational-small-button" type="button" disabled={loading} onClick={() => setRevision(i => i + 1)}>
          <RefreshCw size={15} aria-hidden="true" /> Atualizar
        </button>
      </div>
      <div className="operational-filters">
        <label>Pesquisar por nome ou e-mail<input type="search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Buscar funcionário" /></label>
        <label>Perfil<select value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
          <option value="">Todos</option><option value="MEDICO">Médicos</option><option value="RECEPCIONISTA">Recepcionistas</option><option value="ADMIN">Administradores</option>
        </select></label>
        <label>Situação<select value={active} onChange={e => { setActive(e.target.value); setPage(1); }}>
          <option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option>
        </select></label>
      </div>
      {loading && <p className="local-note" role="status">Carregando funcionários…</p>}
      {!loading && failed && <button className="local-secondary-button" type="button" onClick={() => setRevision(i => i + 1)}>Tentar novamente</button>}
      {!loading && !failed && listing?.items.length === 0 && <div className="local-empty"><Users size={24} aria-hidden="true" />
        <h3>Nenhum funcionário encontrado</h3><p>Experimente limpar os filtros ou cadastre uma conta.</p></div>}
      {!loading && !failed && listing && listing.items.length > 0 && <div className="local-table-wrap"><table className="local-table"><thead><tr>
        <th scope="col">Funcionário</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Situação</th>
      </tr></thead><tbody>{listing.items.map(employee => <tr key={employee.id}>
        <td><strong>{employee.name}</strong></td><td>{employee.email}</td><td>{ROLE_LABEL[employee.role]}</td>
        <td><span className={"operational-state " + (employee.active ? "is-completed" : "is-cancelled")}>{employee.active ? "Ativo" : "Inativo"}</span></td>
      </tr>)}</tbody></table>
      <div className="operational-mobile-cards" aria-label="Funcionários cadastrados">
        {listing.items.map(employee => <article className="operational-mobile-card" key={employee.id}>
          <div><strong>{employee.name}</strong><span className="local-secondary">{employee.email}</span></div>
          <div className="operational-mobile-card-meta"><span>{ROLE_LABEL[employee.role]}</span>
            <span className={"operational-state " + (employee.active ? "is-completed" : "is-cancelled")}>{employee.active ? "Ativo" : "Inativo"}</span></div>
        </article>)}
      </div>
      </div>}
      {!failed && listing && <div className="operational-pagination">
        <span>{listing.total} funcionário(s) · Página {listing.page} de {Math.max(1, Math.ceil(listing.total / listing.pageSize))}</span>
        <div className="local-actions">
          <button type="button" className="local-secondary-button operational-small-button" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} aria-hidden="true" /> Anterior</button>
          <button type="button" className="local-secondary-button operational-small-button" disabled={page * listing.pageSize >= listing.total || loading} onClick={() => setPage(p => p + 1)}>Próxima <ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      </div>}
    </section>
    <Link to="/admin/novo-funcionario" className="operational-text-link">Adicionar outro funcionário <ArrowRight size={15} aria-hidden="true" /></Link>
  </div></AppShell>;
}

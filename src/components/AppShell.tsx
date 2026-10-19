import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  LayoutDashboard,
  Search,
  Building2,
  ListChecks,
  LogOut,
  Menu,
  MonitorPlay,
  Stethoscope,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "./Brand";
import { useAuth } from "../auth/context";
import { ERROR_COPY, AuthError, API_MODE } from "../auth/api";
import { useToast } from "./useToast";

const MAIN_MENU = [
  { to: "/recepcao", label: "Triagem & Fila", icon: ListChecks },
  { to: "/novo-cadastro", label: "Novo Cadastro", icon: UserPlus },
  { to: "/medico", label: "Consultório Médico", icon: Stethoscope },
  { to: "/admin", label: "Painel Administrativo", icon: BarChart3 },
];

const TRANSMISSION_MENU = [
  { to: "/transmissao", label: "Painel TV Pública", icon: MonitorPlay },
];

export function AppShell({
  children,
  headerContext,
  headerTools,
}: {
  children: ReactNode;
  headerContext?: ReactNode;
  headerTools?: ReactNode;
}) {
  const { state, signOut, invalidateSession } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const activeRole = state.status === "authenticated"
    ? state.user.role
    : location.pathname.startsWith("/medico")
      ? "MEDICO"
      : location.pathname.startsWith("/admin")
        ? "ADMIN"
        : "RECEPCIONISTA";
  const userName = state.status === "authenticated"
    ? state.user.name
    : activeRole === "MEDICO"
      ? "Dr. Marcelo Arantes"
      : activeRole === "ADMIN"
        ? "Lucas Vasconcelos"
        : "Dra. Mariana Rios";
  const profile = activeRole === "MEDICO"
    ? "Corpo Clínico"
    : activeRole === "ADMIN"
      ? "Administração"
      : "Triagem & Recepção";
  const receptionPath =
    import.meta.env.DEV && state.status !== "authenticated"
      ? "/recepcao?dev=recepcionista"
      : "/recepcao";
  const newRegistrationPath =
    import.meta.env.DEV && state.status !== "authenticated"
      ? "/novo-cadastro?dev=recepcionista"
      : "/novo-cadastro";
  const doctorPath =
    import.meta.env.DEV && state.status !== "authenticated"
      ? "/medico?dev=medico"
      : "/medico";
  const adminPath =
    import.meta.env.DEV && state.status !== "authenticated"
      ? "/admin?dev=admin"
      : "/admin";
  const managementPath = activeRole === "ADMIN"
    ? (import.meta.env.DEV && state.status !== "authenticated"
        ? "/admin/usuarios?dev=admin" : "/admin/usuarios")
    : (import.meta.env.DEV && state.status !== "authenticated"
        ? "/recepcao/usuarios?dev=recepcionista" : "/recepcao/usuarios");
  const unitContext = headerContext ?? (
    <span className="app-unit-chip">
      <Building2 size={14} aria-hidden="true" />
      {API_MODE ? "PRONTO-SOCORRO · AMBIENTE LOCAL" : "PRONTO-SOCORRO CENTRAL"}
    </span>
  );

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    if (state.status !== "authenticated") {
      invalidateSession();
      navigate("/login", { replace: true });
      setIsSigningOut(false);
      return;
    }
    const controller = new AbortController();
    try {
      await signOut(controller.signal);
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error("Não foi possível encerrar sua sessão.",
        error instanceof AuthError && error.kind === "invalid"
          ? "O serviço não confirmou o encerramento. Tente novamente."
          : ERROR_COPY[error instanceof AuthError ? error.kind : "unavailable"]
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-left">
          <div className="header-brand-wrap">
            <Brand />
          </div>
          <div className="header-context">{unitContext}</div>
        </div>

        <div className="header-right">
          {headerTools && <div className="header-tools">{headerTools}</div>}
          <button
            type="button"
            className="header-menu-toggle"
            aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="header-user" aria-label={state.status === "authenticated" ? "Usuário autenticado" : "Perfil de demonstração"}>
            <div className="header-user-info">
              <strong>{userName}</strong>
              <small>{profile}</small>
            </div>
            <div className="header-avatar" aria-hidden="true">
              <User size={18} />
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside
          className={`sidebar${sidebarOpen ? " is-open" : ""}`}
          aria-label="Navegação principal"
        >
          <nav className="sidebar-nav" aria-label="Módulos de atendimento">
            <div className="nav-group">
              <p className="nav-group-title">MÓDULOS DE ATENDIMENTO</p>
              {MAIN_MENU.filter(({ to }) => !API_MODE || (activeRole === "RECEPCIONISTA" && ["/recepcao", "/novo-cadastro"].includes(to)) || (activeRole === "ADMIN" && to === "/admin")).map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={
                    to === "/recepcao"
                      ? receptionPath
                      : to === "/novo-cadastro"
                        ? newRegistrationPath
                        : to === "/medico"
                          ? doctorPath
                          : to === "/admin"
                            ? adminPath
                            : to
                  }
                  title={label}
                  end={to === "/medico" || to === "/admin"}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `nav-item${isActive ? " is-active" : ""}`
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
              {API_MODE && activeRole === "RECEPCIONISTA" && <NavLink to="/pacientes" onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-item${isActive ? " is-active" : ""}`}><Search size={18} aria-hidden="true" /><span>Pacientes cadastrados</span></NavLink>}
              {API_MODE && activeRole === "MEDICO" && <>
                <NavLink end to="/medico" onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-item${isActive ? " is-active" : ""}`}><LayoutDashboard size={18} aria-hidden="true" /><span>Consultório Médico</span></NavLink>
                <NavLink to="/medico/fila" onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-item${isActive ? " is-active" : ""}`}><ListChecks size={18} aria-hidden="true" /><span>Minha fila</span></NavLink>
                <NavLink to="/medico/atendimento" onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-item${isActive ? " is-active" : ""}`}><Stethoscope size={18} aria-hidden="true" /><span>Paciente atual</span></NavLink>
              </>}
              {activeRole !== "MEDICO" && (!API_MODE || activeRole === "ADMIN") && (
                <NavLink
                  to={managementPath}
                  title="Gestão de Usuários"
                  end
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `nav-item${isActive ? " is-active" : ""}`
                  }
                >
                  <Users size={18} aria-hidden="true" />
                  <span>Gestão de Usuários</span>
                </NavLink>
              )}
            </div>

            <div className="nav-group">
              <p className="nav-group-title">TRANSMISSÃO</p>
              {!API_MODE && TRANSMISSION_MENU.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={label}
                  className={({ isActive }) =>
                    `nav-item${isActive ? " is-active" : ""}`
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </nav>

          <button
            className="sidebar-signout-button"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>{isSigningOut ? "Saindo..." : "Sair"}</span>
          </button>

          <div className="sidebar-footer">
            <span className="service-status-dot" aria-hidden="true" />
            <span>{API_MODE ? "Ambiente local" : "Serviço Ativo"}</span>
            <strong>v2.4</strong>
          </div>
        </aside>

        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}

import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Building2,
  ListChecks,
  Menu,
  MonitorPlay,
  Stethoscope,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { Brand } from "./Brand";
import { useAuth } from "../auth/context";

const MAIN_MENU = [
  { to: "/recepcao", label: "Triagem & Fila", icon: ListChecks },
  { to: "/novo-cadastro", label: "Novo Cadastro", icon: UserPlus },
  { to: "/medico", label: "Consultório Médico", icon: Stethoscope },
  { to: "/admin", label: "Painel Administrativo", icon: BarChart3 },
];

const TRANSMISSION_MENU = [
  { to: "/transmissao", label: "Painel TV Pública", icon: MonitorPlay },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userName =
    state.status === "authenticated" ? state.user.name : "Dra. Mariana Rios";
  const profile = "Triagem & Recepção";
  const receptionPath =
    import.meta.env.DEV && state.status !== "authenticated"
      ? "/recepcao?dev=recepcionista"
      : "/recepcao";
  const newRegistrationPath =
    import.meta.env.DEV && state.status !== "authenticated"
      ? "/novo-cadastro?dev=recepcionista"
      : "/novo-cadastro";

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-left">
          <div className="header-brand-wrap">
            <Brand />
          </div>
          <div className="header-facility-chip">
            <Building2 size={14} aria-hidden="true" />
            <span>PRONTO-SOCORRO CENTRAL</span>
          </div>
        </div>

        <div className="header-brand-center" aria-label="Marca do sistema">
          <span className="mini-pulse-icon" aria-hidden="true">
            <Activity size={10} />
          </span>
          <span>Agora <span className="brand-accent">Você</span></span>
        </div>

        <div className="header-right">
          <button
            type="button"
            className="header-menu-toggle"
            aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="header-user" aria-label="Usuário autenticado">
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
          aria-label="Navegação da recepção"
        >
          <nav className="sidebar-nav" aria-label="Módulos de atendimento">
            <div className="nav-group">
              <p className="nav-group-title">MÓDULOS DE ATENDIMENTO</p>
              {MAIN_MENU.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to === "/recepcao" ? receptionPath : to === "/novo-cadastro" ? newRegistrationPath : to}
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

            <div className="nav-group">
              <p className="nav-group-title">TRANSMISSÃO</p>
              {TRANSMISSION_MENU.map(({ to, label, icon: Icon }) => (
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

          <div className="sidebar-footer">
            <span className="service-status-dot" aria-hidden="true" />
            <span>Serviço Ativo</span>
            <strong>v2.4</strong>
          </div>
        </aside>

        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}

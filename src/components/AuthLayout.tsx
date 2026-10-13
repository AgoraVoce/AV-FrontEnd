import type { ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  ClipboardList,
  Clock3,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "./Brand";
import { LOGIN_PRESENTATION } from "../auth/role-presentation";
import "../styles/login.css";

export function AuthLayout({
  children,
  titleId,
  presentation = LOGIN_PRESENTATION,
  variant = "standard",
}: {
  children: ReactNode;
  titleId: string;
  presentation?: typeof LOGIN_PRESENTATION;
  variant?: "standard" | "login";
}) {
  const isLogin = variant === "login";
  return (
    <main className={`login-page${isLogin ? " login-page--refresh" : ""}`}>
      <div className={`login-card${isLogin ? " login-card--refresh" : ""}`}>
        {isLogin ? (
          <aside className="login-visual-panel">
            <div className="login-visual-heading">
              <div>
                <div className="login-brand-line">
                  <Brand />
                  <span className="login-online-badge">
                    <span aria-hidden="true" />
                    ONLINE
                  </span>
                </div>
                <p className="login-product-subtitle">
                  SISTEMA DE PRIORIZAÇÃO DE ATENDIMENTO
                </p>
              </div>
              <span className="login-location-badge">
                <MapPin size={12} aria-hidden="true" />
                Unidade Matriz #01
              </span>
            </div>

            <div className="login-triage-visual">
              <img
                src="/login.png"
                alt="Equipe realizando triagem na recepção"
              />
              <span className="login-live-badge">
                <span aria-hidden="true" />
                Triagem em Tempo Real
              </span>
              <div className="login-protocol-overlay">
                <BadgeCheck size={18} aria-hidden="true" />
                <span>
                  <strong>PROTOCOLO CLÍNICO ATIVO</strong>
                  <small>Manchester v3.4 Integrado</small>
                </span>
                <span
                  className="login-risk-dots"
                  role="img"
                  aria-label="Níveis de risco: tranquilo, alerta e urgente"
                >
                  <i className="is-calm" />
                  <i className="is-alert" />
                  <i className="is-urgent" />
                </span>
              </div>
            </div>

            <div className="login-metric-grid">
              <article className="login-metric-card">
                <span className="login-metric-icon">
                  <Clock3 size={16} aria-hidden="true" />
                </span>
                <div>
                  <p>TEMPO MÉDIO CLASSIFICAÇÃO</p>
                  <strong>1m 42s</strong>
                  <small>Meta &lt; 3min</small>
                </div>
              </article>
              <article className="login-metric-card">
                <span className="login-metric-icon is-green">
                  <ClipboardList size={16} aria-hidden="true" />
                </span>
                <div>
                  <p>FILA NA RECEPÇÃO</p>
                  <strong>6 aguardando</strong>
                  <small>Triagem ativa</small>
                </div>
              </article>
            </div>

            <div
              className="login-security-badges"
              aria-label="Segurança do sistema"
            >
              <span>
                <LockKeyhole size={11} aria-hidden="true" />
                Criptografia SSL 256-bit
              </span>
              <span>
                <ShieldCheck size={11} aria-hidden="true" />
                Auditoria Sanitária Ativa
              </span>
              <span>
                <Activity size={11} aria-hidden="true" />
                Servidor Triagem v3.4
              </span>
            </div>
          </aside>
        ) : (
          <aside className="brand-panel">
            <Brand />
            <div className="brand-story">
              <h2>
                {presentation.headline.map((line) => (
                  <span key={line}>{line}</span>
                ))}
                <span className="brand-accent">{presentation.accent}</span>
              </h2>
              <p>{presentation.description}</p>
            </div>
            <div className="brand-bottom">
              <svg
                className="pulse-line"
                viewBox="0 0 560 88"
                fill="none"
                aria-hidden="true"
                preserveAspectRatio="none"
              >
                <path d="M0 57H128c11 0 13-13 20-13s11 17 17 13l18-52c2-6 5-6 7 0l17 66c2 7 6 6 8-1l11-36c3-9 7-9 11 0l5 10H560" />
              </svg>
              <p>Sistema de prioridade e atendimento</p>
            </div>
          </aside>
        )}
        <section
          className={`form-panel${isLogin ? " login-form-panel" : ""}`}
          aria-labelledby={titleId}
        >
          <div className="form-content">{children}</div>
        </section>
      </div>
      {!isLogin && (
        <footer className="page-footer">Agora Você · Acesso interno</footer>
      )}
    </main>
  );
}

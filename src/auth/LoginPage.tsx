import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Settings2,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Feedback, Spinner } from "../components/Feedback";
import { usePageTitle } from "../components/usePageTitle";
import { AuthError, ERROR_COPY } from "./api";
import { useAuth } from "./context";
import { HOME_BY_ROLE, ROLES } from "./types";
import type { Role } from "./types";
import { PRESENTATION } from "./role-presentation";
const ICON_BY_ROLE = {
  RECEPCIONISTA: UserRound,
  MEDICO: Stethoscope,
  ADMIN: Settings2,
};
export function LoginPage() {
  const { state, signIn, restore } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawRole = params.get("area");
  const role: Role = ROLES.includes(rawRole as Role)
    ? (rawRole as Role)
    : "RECEPCIONISTA";
  const presentation = PRESENTATION[role];
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState({ login: "", password: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  usePageTitle(`Login · ${presentation.label}`);
  const invalidCredentials = formError === ERROR_COPY.invalid;
  useEffect(() => {
    if (!busy && invalidCredentials) passwordRef.current?.focus();
  }, [busy, invalidCredentials]);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || state.status !== "anonymous") return;
    const next = {
      login: login.trim() ? "" : "Informe seu login.",
      password: password ? "" : "Informe sua senha.",
    };
    setErrors(next);
    setFormError(null);
    if (next.login || next.password) {
      (next.login ? loginRef : passwordRef).current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    try {
      await signIn(login.trim(), password, request.signal);
    } catch (error) {
      if (!request.signal.aborted) {
        setFormError(
          ERROR_COPY[error instanceof AuthError ? error.kind : "unavailable"],
        );
        if (error instanceof AuthError && error.kind === "invalid") {
          setPassword("");
          setReveal(false);
        }
      }
    } finally {
      if (!request.signal.aborted) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  if (state.status === "authenticated")
    return <Navigate to={HOME_BY_ROLE[state.user.role]} replace />;
  const checking = state.status === "checking";
  const unavailable = state.status === "error";
  return (
    <main className="login-page">
      <div className="login-card">
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
        <section className="form-panel" aria-labelledby="login-title">
          <div className="form-content">
            <header className="form-heading">
              <p className="eyebrow">Acesso à equipe</p>
              <h1 id="login-title" ref={headingRef} tabIndex={-1}>
                Bem-vindo de volta.
              </h1>
              <p>Entre com suas credenciais para continuar.</p>
            </header>
            <div className="area-picker">
              <p id="area-label">Área de acesso</p>
              <div
                className="area-options"
                role="group"
                aria-labelledby="area-label"
              >
                {ROLES.map((value) => {
                  const Icon = ICON_BY_ROLE[value];
                  return (
                    <button
                      type="button"
                      key={value}
                      className={`area-option${role === value ? " is-selected" : ""}`}
                      aria-pressed={role === value}
                      disabled={busy}
                      onClick={() =>
                        setParams({ area: value }, { replace: true })
                      }
                    >
                      <Icon size={25} strokeWidth={1.7} aria-hidden="true" />
                      <span>{PRESENTATION[value].label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <form noValidate onSubmit={submit} aria-busy={busy || checking}>
              <div className="field">
                <label htmlFor="login">Login</label>
                <input
                  id="login"
                  ref={loginRef}
                  type="text"
                  name="login"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={254}
                  value={login}
                  disabled={busy || checking || unavailable}
                  placeholder="Seu identificador de acesso"
                  aria-invalid={Boolean(errors.login)}
                  aria-describedby={errors.login ? "login-error" : "login-help"}
                  onChange={(event) => {
                    setLogin(event.target.value);
                    if (errors.login)
                      setErrors((old) => ({ ...old, login: "" }));
                  }}
                />
                <p
                  className={`field-help${errors.login ? " field-error" : ""}`}
                  id={errors.login ? "login-error" : "login-help"}
                >
                  {errors.login || presentation.loginHelp}
                </p>
              </div>
              <div className="field">
                <label htmlFor="password">Senha</label>
                <div className="password-wrap">
                  <input
                    id="password"
                    ref={passwordRef}
                    type={reveal ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    maxLength={1024}
                    value={password}
                    disabled={busy || checking || unavailable}
                    placeholder="Sua senha de acesso"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby="password-error"
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (errors.password)
                        setErrors((old) => ({ ...old, password: "" }));
                    }}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={reveal ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={reveal}
                    disabled={busy || checking || unavailable}
                    onClick={() => setReveal((value) => !value)}
                  >
                    {reveal ? (
                      <EyeOff size={22} aria-hidden="true" />
                    ) : (
                      <Eye size={22} aria-hidden="true" />
                    )}
                  </button>
                </div>
                <p className="field-help field-error" id="password-error">
                  {errors.password || "\u00a0"}
                </p>
              </div>
              <div className="form-feedback">
                {formError && <Feedback message={formError} />}
                {unavailable && (
                  <Feedback
                    message="Não foi possível verificar sua sessão."
                    retry={() => {
                      void restore();
                    }}
                  />
                )}
              </div>
              <button
                type="submit"
                className="primary-button"
                disabled={busy || checking || unavailable}
              >
                <span>
                  {busy
                    ? "Entrando…"
                    : checking
                      ? "Verificando sessão…"
                      : "Entrar no sistema"}
                </span>
                {busy || checking ? (
                  <Spinner />
                ) : (
                  <ArrowRight size={21} aria-hidden="true" />
                )}
              </button>
              <p className="sr-only" role="status">
                {busy
                  ? "Autenticação em andamento."
                  : checking
                    ? "Verificação de sessão em andamento."
                    : ""}
              </p>
            </form>
            <p className="access-note">
              <LockKeyhole size={18} aria-hidden="true" />
              <span>Seu acesso é definido pelo perfil da sua conta.</span>
            </p>
          </div>
        </section>
      </div>
      <footer className="page-footer">Agora Você · Acesso interno</footer>
    </main>
  );
}

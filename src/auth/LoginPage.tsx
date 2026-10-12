import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { PasswordField } from "../components/PasswordField";
import { Spinner } from "../components/Feedback";
import { ErrorToast } from "../components/ErrorToast";
import { usePageTitle } from "../components/usePageTitle";
import { AuthError, ERROR_COPY } from "./api";
import { useAuth } from "./context";
import { HOME_BY_ROLE } from "./types";
import { LOGIN_PRESENTATION as presentation } from "./role-presentation";
export function LoginPage() {
  const { state, signIn } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState({ login: "", password: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const [correctedNotice, setCorrectedNotice] = useState<{
    login: string | null;
    password: string | null;
  }>({ login: null, password: null });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  usePageTitle("Login");
  const notice =
    formError ||
    (state.status === "error"
      ? "Não foi possível verificar sua sessão. Entre com seu e-mail e senha."
      : null);
  const loginInvalid = Boolean(notice && correctedNotice.login !== notice);
  const passwordInvalid = Boolean(
    notice && correctedNotice.password !== notice,
  );
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
    if (lock.current || state.status === "authenticated") return;
    const next = {
      login: !login.trim()
        ? "Informe seu e-mail."
        : loginRef.current?.validity.typeMismatch
          ? "Informe um e-mail válido."
          : "",
      password: password ? "" : "Informe sua senha.",
    };
    setErrors(next);
    setFormError(null);
    setDismissedNotice(null);
    if (next.login || next.password) {
      (next.login ? loginRef : passwordRef).current?.focus();
      return;
    }
    lock.current = true;
    setCorrectedNotice({ login: null, password: null });
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
  return (
    <AuthLayout titleId="login-title">
      <header className="form-heading">
        <p className="eyebrow">Acesso à equipe</p>
        <h1 id="login-title" ref={headingRef} tabIndex={-1}>
          Bem-vindo de volta.
        </h1>
        <p>Entre com seu e-mail e senha para continuar.</p>
      </header>
      <form noValidate onSubmit={submit} aria-busy={busy}>
        <div className="field">
          <label htmlFor="login">E-mail</label>
          <input
            id="login"
            ref={loginRef}
            type="email"
            inputMode="email"
            name="login"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            value={login}
            disabled={busy}
            placeholder="voce@clinica.com.br"
            aria-invalid={Boolean(errors.login) || loginInvalid}
            aria-describedby={[
              errors.login ? "login-error" : "login-help",
              loginInvalid ? "login-auth-error" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            onChange={(event) => {
              setLogin(event.target.value);
              setCorrectedNotice((old) => ({ ...old, login: notice }));
              if (errors.login) setErrors((old) => ({ ...old, login: "" }));
            }}
          />
          <p
            className={`field-help${errors.login ? " field-error" : ""}`}
            id={errors.login ? "login-error" : "login-help"}
          >
            {errors.login || presentation.loginHelp}
          </p>
        </div>
        <PasswordField
          id="password"
          label="Senha"
          value={password}
          inputRef={passwordRef}
          autoComplete="current-password"
          revealed={reveal}
          onToggle={() => setReveal((value) => !value)}
          disabled={busy}
          error={errors.password}
          invalid={passwordInvalid}
          descriptionId={passwordInvalid ? "login-auth-error" : undefined}
          onChange={(value) => {
            setPassword(value);
            setCorrectedNotice((old) => ({ ...old, password: notice }));
            if (errors.password) setErrors((old) => ({ ...old, password: "" }));
          }}
        />
        <div className="recovery-link-row">
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
        </div>
        <div className="form-feedback">
          {checking && !busy && (
            <p className="session-check" role="status">
              Verificando sua sessão… Você já pode entrar.
            </p>
          )}
          <p id="login-auth-error" className="sr-only">
            {notice}
          </p>
        </div>
        <button
          type="submit"
          className="primary-button"
          disabled={busy || !login.trim() || !password}
        >
          <span>{busy ? "Entrando…" : "Entrar no sistema"}</span>
          {busy ? <Spinner /> : <ArrowRight size={21} aria-hidden="true" />}
        </button>
        <p className="sr-only" role="status">
          {busy ? "Autenticação em andamento." : ""}
        </p>
      </form>
      <p className="access-note">
        <LockKeyhole size={18} aria-hidden="true" />
        <span>Seu acesso é definido pelo perfil da sua conta.</span>
      </p>
      <ErrorToast
        message={notice === dismissedNotice ? null : notice}
        onDismiss={() => {
          setDismissedNotice(notice);
          (invalidCredentials ? passwordRef : loginRef).current?.focus();
        }}
      />
    </AuthLayout>
  );
}

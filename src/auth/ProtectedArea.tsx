import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, LogOut, ShieldCheck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Feedback, Spinner } from "../components/Feedback";
import { usePageTitle } from "../components/usePageTitle";
import { useAuth } from "./context";
import { AuthError, ERROR_COPY } from "./api";
import { HOME_BY_ROLE, LABEL_BY_ROLE } from "./types";
import type { Role } from "./types";
import { AREA_PERMISSION_BY_ROLE, hasPermission } from "./permissions";
export function ProtectedArea({
  role,
  children,
}: {
  role: Role;
  children?: ReactNode;
}) {
  const { state, signOut } = useAuth();
  const devBypass =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("dev")?.toLowerCase() ===
      role.toLowerCase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const title =
    state.status === "authenticated" &&
    !hasPermission(state.user, AREA_PERMISSION_BY_ROLE[role])
      ? "Acesso não permitido"
      : LABEL_BY_ROLE[role];
  usePageTitle(children ? "" : title);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  async function logout() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const request = new AbortController();
    controller.current = request;
    try {
      await signOut(request.signal);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof AuthError && cause.kind === "invalid"
            ? "O serviço não confirmou o encerramento. Tente novamente."
            : ERROR_COPY[
                cause instanceof AuthError ? cause.kind : "unavailable"
              ],
        );
    } finally {
      if (!request.signal.aborted) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  if (devBypass) {
    if (children) return <>{children}</>;
    return (
      <main className="area-page">
        <header className="area-header">
          <Brand compact />
        </header>
        <section className="area-welcome">
          <div className="welcome-icon">
            <ShieldCheck size={30} aria-hidden="true" />
          </div>
          <p className="eyebrow">Modo local</p>
          <h1>Visualização de desenvolvimento.</h1>
          <p>Sessão simulada ativada para testar a área em ambiente local.</p>
        </section>
      </main>
    );
  }

  if (state.status === "anonymous" || state.status === "error")
    return <Navigate to="/login" replace />;
  if (state.status === "checking")
    return (
      <main className="session-page">
        <Brand />
        <div className="session-status">
          <p role="status">
            <Spinner />
            Verificando seu acesso…
          </p>
        </div>
      </main>
    );
  const forbidden = !hasPermission(state.user, AREA_PERMISSION_BY_ROLE[role]);

  if (children) {
    if (forbidden) {
      return (
        <main className="area-page">
          <header className="area-header">
            <Brand compact />
          </header>
          <section className="area-welcome">
            <div className="welcome-icon">
              <ShieldCheck size={30} aria-hidden="true" />
            </div>
            <p className="eyebrow">Acesso restrito</p>
            <h1>Esta área não está disponível para seu perfil.</h1>
            <p>Continue na área autorizada para sua conta.</p>
            <Link className="primary-button" to={HOME_BY_ROLE[state.user.role]}>
              Ir para minha área
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
          </section>
        </main>
      );
    }

    return <>{children}</>;
  }

  return (
    <main className="area-page">
      <header className="area-header">
        <Brand compact />
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            void logout();
          }}
          disabled={busy}
        >
          {busy ? <Spinner /> : <LogOut size={18} aria-hidden="true" />}
          {busy ? "Saindo…" : "Sair"}
        </button>
      </header>
      <section className="area-welcome">
        <div className="welcome-icon">
          <ShieldCheck size={30} aria-hidden="true" />
        </div>
        <p className="eyebrow">
          {forbidden ? "Acesso restrito" : LABEL_BY_ROLE[role]}
        </p>
        <h1>
          {forbidden
            ? "Esta área não está disponível para seu perfil."
            : `Olá, ${state.user.name}.`}
        </h1>
        <p>
          {forbidden
            ? "Continue na área autorizada para sua conta."
            : "Sua sessão foi verificada. Você está na área correspondente ao seu perfil."}
        </p>
        {forbidden && (
          <Link className="primary-button" to={HOME_BY_ROLE[state.user.role]}>
            Ir para minha área
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        )}
        {error && (
          <Feedback
            message={`Não foi possível encerrar sua sessão. ${error}`}
          />
        )}
        <p className="sr-only" role="status">
          {busy ? "Encerrando sessão." : ""}
        </p>
      </section>
    </main>
  );
}

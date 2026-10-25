import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/AppShell";
import { usePageTitle } from "../../components/usePageTitle";
import "../../integrations/local.css";
import "../../integrations/operations.css";
import "../../pages/Admin/admin-sections.css";
import "./clinic.css";
export function ClinicPage({
  title,
  own = false,
  children,
}: {
  title: string;
  own?: boolean;
  children: ReactNode;
}) {
  usePageTitle(title);
  return (
    <AppShell>
      <div className="local-page operational-page">
        <header className="local-page-head">
          <div>
            <span className="local-eyebrow">
              {own ? "Consultório Médico" : "Administração"} · Corpo clínico
            </span>
            <h1>{title}</h1>
          </div>
          <Link
            className="local-secondary-button"
            to={own ? "/medico" : "/admin"}
          >
            Voltar ao {own ? "Dashboard médico" : "Painel Administrativo"}
          </Link>
        </header>
        {children}
      </div>
    </AppShell>
  );
}
export function ResourceState({
  loading,
  error,
  retry,
  empty,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  empty?: boolean;
}) {
  if (loading) return <p role="status">Carregando dados…</p>;
  if (error)
    return (
      <div className="local-empty">
        <p role="alert">{error}</p>
        <button className="local-secondary-button" onClick={retry}>
          Tentar novamente
        </button>
      </div>
    );
  if (empty)
    return (
      <div className="local-empty">
        <h2>Nenhum registro encontrado</h2>
        <p>Confira os filtros ou cadastre um registro.</p>
      </div>
    );
  return null;
}
export function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="clinic-field-error" role="alert">
      {message}
    </span>
  ) : null;
}
export function Status({ active, label }: { active: boolean; label?: string }) {
  return (
    <span
      className={
        "operational-state " + (active ? "is-completed" : "is-cancelled")
      }
    >
      {label ?? (active ? "Ativo" : "Inativo")}
    </span>
  );
}
export function Confirm({
  title,
  children,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => {
      el?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="clinic-dialog"
      aria-labelledby="clinic-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="local-form">
        <h2 id="clinic-confirm-title">{title}</h2>
        <div>{children}</div>
        <div className="local-actions">
          <button
            autoFocus
            className="local-secondary-button"
            onClick={onCancel}
            disabled={busy}
          >
            Voltar
          </button>
          <button className="local-primary" onClick={onConfirm} disabled={busy}>
            {busy ? "Salvando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
/** Accessible modal editor for clinic workflows. */
export function EditorDialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = dialog.current;
    const focused = document.activeElement;
    opener.current = focused instanceof HTMLElement ? focused : null;
    el?.showModal();
    return () => {
      if (el?.open) el.close();
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="clinic-dialog clinic-editor-dialog"
      aria-label={title}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function FormActions({
  saving,
  onCancel,
  error,
}: {
  saving: boolean;
  onCancel: () => void;
  error: string;
}) {
  return (
    <>
      {error && (
        <p role="alert">{error} Revise os dados e tente salvar novamente.</p>
      )}
      <div className="local-actions">
        <button className="local-primary" disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          className="local-secondary-button"
          disabled={saving}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </>
  );
}

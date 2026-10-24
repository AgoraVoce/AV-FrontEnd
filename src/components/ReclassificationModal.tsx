import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Check,
  CircleCheck,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import type { User } from "../auth/types";
import { LABEL_BY_ROLE } from "../auth/types";
import {
  operations,
  type EntryDetail,
  type Severity,
} from "../integrations/operational-api";
import { PRIORITY_LEVELS } from "../integrations/priority-store";
import { updatePatientPriority } from "../integrations/reception-reassessment";
import "./reclassification-modal.css";

type Props = {
  patient: { entryId: string; fullName: string; queueCode: string | null };
  responsible: User | null;
  available: boolean;
  onDetail: (entry: EntryDetail) => void;
  onClose: () => void;
  onSaved: (entry: EntryDetail) => void;
  returnFocus: HTMLElement | null;
};
export function ReclassificationModal({
  patient,
  responsible,
  available,
  onClose,
  onSaved,
  returnFocus,
  onDetail,
}: Props) {
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [level, setLevel] = useState<Severity | null>(null);
  const [reason, setReason] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [keepRegistered, setKeepRegistered] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [touched, setTouched] = useState(false);
  const [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const saveRequest = useRef<AbortController | null>(null);
  const currentLevel = detail?.severity ?? null;
  const hasSymptomContract = Array.isArray(detail?.symptomIds);
  const symptomIds = keepRegistered ? (detail?.symptomIds ?? []) : [];
  const symptomsValid = symptomIds.length > 0 || symptoms.trim().length > 0;
  const symptomsChanged =
    symptoms.trim() !== (detail?.otherSymptoms ?? "").trim() ||
    (!keepRegistered && Boolean(detail?.symptomIds?.length));
  const waiting = available && (!detail || detail.status === "waiting");
  const reasonValid = reason.trim().length >= 10;
  const canSave = Boolean(
    detail &&
    responsible &&
    waiting &&
    level &&
    (level !== currentLevel || symptomsChanged) &&
    hasSymptomContract &&
    symptomsValid &&
    reasonValid &&
    !busy,
  );

  useEffect(() => {
    const controller = new AbortController();
    void operations
      .entry(patient.entryId, controller.signal)
      .then((entry) => {
        if (!controller.signal.aborted) {
          onDetail(entry);
          setDetail(entry);
          setLevel(entry.severity ?? null);
          setSymptoms(entry.otherSymptoms ?? "");
          setKeepRegistered(true);
          setDetailError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setDetailError(
            "Não foi possível consultar a classificação atual. Tente novamente.",
          );
      });
    return () => controller.abort();
    // A polling update must not replace the user's draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.entryId, revision]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const previousInert = shell?.inert;
    if (shell) shell.inert = true;
    dialog.current
      ?.querySelector<HTMLInputElement>('input[type="radio"]')
      ?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pending.current) onClose();
      }
      if (event.key === "Tab") {
        const controls = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), textarea:not(:disabled), input[type="checkbox"]:not(:disabled), input[type="radio"]:not(:disabled):checked, input[type="radio"]:not(:disabled)[tabindex="0"], a[href]',
          ) ?? [],
        );
        if (!controls.length) {
          event.preventDefault();
          dialog.current?.focus();
          return;
        }
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      saveRequest.current?.abort();
      document.body.style.overflow = previousOverflow;
      if (shell) shell.inert = previousInert ?? false;
      document.removeEventListener("keydown", onKey);
      requestAnimationFrame(() => {
        const trigger = document.querySelector<HTMLElement>(
          `[data-review-entry="${CSS.escape(patient.entryId)}"]`,
        );
        if (trigger) trigger.focus();
        else if (returnFocus?.isConnected) returnFocus.focus();
        else
          document
            .querySelector<HTMLElement>(
              '[aria-label="Buscar por nome ou senha"]',
            )
            ?.focus();
      });
    };
  }, [onClose, returnFocus, patient.entryId]);

  useEffect(() => {
    if (!available) saveRequest.current?.abort();
  }, [available]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSave || !responsible || !detail || !level || pending.current)
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    saveRequest.current = controller;
    try {
      const saved = await updatePatientPriority(detail.patientId, {
        entryId: patient.entryId,
        level,
        reason,
        previous: detail,
        symptomIds,
        otherSymptoms: symptoms,
        signal: controller.signal,
      });
      onSaved(saved.detail);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível salvar a alteração.",
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return createPortal(
    <div
      className="reclassification-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending.current) onClose();
      }}
    >
      <div
        ref={dialog}
        className="reclassification-modal"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="reclassification-title"
      >
        <button
          className="reclassification-close"
          aria-label="Fechar reavaliação"
          disabled={busy}
          type="button"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <div className="reclassification-eyebrow">
          <ShieldCheck size={15} /> RECLASSIFICAÇÃO CLÍNICA
        </div>
        <h2 id="reclassification-title">Alterar Prioridade do Paciente</h2>
        <p className="reclassification-patient">
          Paciente: <strong>{patient.fullName}</strong>{" "}
          <code>{patient.queueCode || "—"}</code>
        </p>
        <form aria-busy={busy} onSubmit={(event) => void save(event)}>
          <fieldset>
            <legend>Selecione o Novo Nível de Gravidade</legend>
            <div
              className="reclassification-levels"
              role="radiogroup"
              aria-label="Novo nível de gravidade"
            >
              {PRIORITY_LEVELS.map(
                ({ level: value, label, color, tone }, index) => (
                  <label
                    key={value}
                    className={`reclassification-level ${tone}${level === value ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="reclassification-level"
                      disabled={busy}
                      value={value}
                      checked={level === value}
                      tabIndex={
                        level === value || (!level && index === 0) ? 0 : -1
                      }
                      onChange={() => setLevel(value)}
                      onKeyDown={(event) => {
                        if (
                          [
                            "ArrowRight",
                            "ArrowDown",
                            "ArrowLeft",
                            "ArrowUp",
                          ].includes(event.key)
                        ) {
                          event.preventDefault();
                          const next =
                            (index +
                              (["ArrowRight", "ArrowDown"].includes(event.key)
                                ? 1
                                : 2)) %
                            3;
                          setLevel(PRIORITY_LEVELS[next].level);
                          const radios =
                            dialog.current?.querySelectorAll<HTMLInputElement>(
                              'input[type="radio"]',
                            );
                          radios?.[next]?.focus();
                        }
                      }}
                    />
                    <span className="reclassification-level-title">
                      <span className="reclassification-dot" />
                      {level === value && <Check size={13} />}
                      <strong>{label}</strong>
                    </span>
                    <small>{color}</small>
                  </label>
                ),
              )}
            </div>
          </fieldset>
          {detailError ? (
            <p role="alert" className="reclassification-error">
              {detailError}{" "}
              <button type="button" onClick={() => setRevision((n) => n + 1)}>
                Tentar novamente
              </button>
            </p>
          ) : (
            !detail && (
              <p role="status" className="reclassification-note">
                Consultando classificação atual…
              </p>
            )
          )}
          <div className="reclassification-symptoms">
            <label htmlFor="reclassification-symptoms">
              Sintomas / queixa atualizada <span>*</span>
            </label>
            <textarea
              id="reclassification-symptoms"
              rows={3}
              maxLength={2000}
              value={symptoms}
              onChange={(event) => setSymptoms(event.target.value)}
              disabled={!detail || busy}
              placeholder="Descreva os sintomas atuais do paciente..."
              aria-describedby="reclassification-symptoms-help"
            />
            {Boolean(detail?.symptomIds?.length) && (
              <label className="reclassification-keep-symptoms">
                <input
                  type="checkbox"
                  checked={keepRegistered}
                  disabled={busy}
                  onChange={(event) => setKeepRegistered(event.target.checked)}
                />{" "}
                Manter os {detail?.symptomIds?.length} sintomas estruturados já
                registrados
              </label>
            )}
            <p
              id="reclassification-symptoms-help"
              className="reclassification-note"
            >
              Atualize a descrição dos sintomas.{" "}
              {detail?.symptomIds?.length
                ? "Desmarque a opção acima para substituir os sintomas estruturados pela nova descrição."
                : "Informe ao menos uma queixa para salvar."}
            </p>
            {detail && !hasSymptomContract && (
              <p className="reclassification-error">
                Os sintomas registrados não puderam ser verificados. Reabra a
                reavaliação antes de salvar.
              </p>
            )}
            {detail && !symptomsValid && (
              <p className="reclassification-error">
                Informe os sintomas ou mantenha os sintomas já registrados.
              </p>
            )}
          </div>
          <div className="reclassification-vitals">
            <Activity size={17} />
            <span>PA: — mmHg</span>
            <span>FC: — bpm</span>
            <span>SpO2: —%</span>
            <span>Temp: — °C</span>
          </div>
          <div className="reclassification-reason-head">
            <label htmlFor="reclassification-reason">
              Motivo da alteração de prioridade <span>*</span>
            </label>
            <small>{reason.length}/300 caracteres</small>
          </div>
          <textarea
            id="reclassification-reason"
            disabled={busy}
            maxLength={300}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Descreva a justificativa clínica da alteração..."
            aria-required="true"
            aria-invalid={touched && !reasonValid}
            aria-describedby={
              touched && !reasonValid
                ? "reclassification-reason-error"
                : undefined
            }
          />
          {touched && !reasonValid && (
            <p
              id="reclassification-reason-error"
              className="reclassification-error"
            >
              Informe uma justificativa com pelo menos 10 caracteres.
            </p>
          )}
          <div className="reclassification-responsible">
            <UserRound size={17} />
            <span>
              Responsável:{" "}
              <strong>
                {responsible
                  ? `${responsible.name} · ${LABEL_BY_ROLE[responsible.role]}`
                  : "—"}
              </strong>
            </span>
          </div>
          {!waiting && (
            <p role="alert" className="reclassification-error">
              Este paciente saiu da fila de espera. Não é possível salvar a
              alteração.
            </p>
          )}
          {error && (
            <p role="alert" className="reclassification-error">
              {error}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="reclassification-cancel"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <span
              className="reclassification-save-guard"
              onPointerDown={() => {
                if (!reasonValid) setTouched(true);
              }}
            >
              <button
                type="submit"
                className="reclassification-save"
                disabled={!canSave}
              >
                <CircleCheck size={16} />
                {busy ? "Salvando..." : "Salvar Alteração"}
              </button>
            </span>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}

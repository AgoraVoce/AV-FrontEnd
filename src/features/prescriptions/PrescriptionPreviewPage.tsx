import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Download, Printer, RefreshCw } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AppShell } from "../../components/AppShell";
import { usePageTitle } from "../../components/usePageTitle";
import { useToast } from "../../components/useToast";
import type {
  EntryDetail,
  PrescriptionEmailResult,
  PrescriptionEmailStatus,
} from "../../integrations/operational-api";
import { operations } from "../../integrations/operational-api";
import { openPrescriptionPdf } from "../../integrations/extended-api";
import { errorText } from "../../integrations/shared-helpers";
import { useAuth } from "../../auth/context";
import { getEntrySymptomNames } from "./draft-store";
import { buildPrescriptionDocument, isRenderablePrescription } from "./model";
import { PrescriptionDocument } from "./PrescriptionDocument";
import "./prescription.css";
import "./prescription-print.css";

const emailStatusLabel: Record<PrescriptionEmailStatus, string> = {
  queued: "Solicitação registrada, aguardando processamento",
  processing: "Preparando e enviando a prescrição",
  accepted: "E-mail aceito pelo Gmail; recebimento não confirmado",
  delivery_delayed: "Entrega atrasada, conforme estado registrado",
  delivered: "Entrega confirmada pelo provedor registrado",
  failed: "O envio apresentou uma falha",
  unknown: "Não foi possível confirmar o resultado do envio",
};

type EmailUiState = {
  key: string;
  capability: PrescriptionEmailResult | null;
  loading: boolean;
  busy: boolean;
  phase: "idle" | "validating" | "submitting";
  uncertain: boolean;
  error: string;
  consentOpen: boolean;
  consent: boolean;
  idempotencyKey: string;
};

function initialEmailUiState(key: string): EmailUiState {
  return {
    key,
    capability: null,
    loading: false,
    busy: false,
    phase: "idle",
    uncertain: false,
    error: "",
    consentOpen: false,
    consent: false,
    idempotencyKey: "",
  };
}

function canRequestEmail(capability: PrescriptionEmailResult | null) {
  return Boolean(
    capability?.supported &&
    capability.eligible &&
    (!capability.latestDelivery ||
      capability.latestDelivery.status === "failed"),
  );
}

type PageState = {
  key: string;
  entry: EntryDetail | null;
  loading: boolean;
  error: "" | "unavailable" | "not-completed" | "mismatch";
  retry: number;
};

export function PrescriptionPreviewPage() {
  const { entryId = "" } = useParams<{ entryId: string }>();
  const location = useLocation();
  const toast = useToast();
  const { state: authState } = useAuth();
  const userId = authState.status === "authenticated" ? authState.user.id : "";
  const requestKey = JSON.stringify([userId, entryId]);
  const [state, setState] = useState<PageState>({
    key: "",
    entry: null,
    loading: true,
    error: "",
    retry: 0,
  });
  const [pdfBusy, setPdfBusy] = useState(false);
  const [emailState, setEmailState] = useState<EmailUiState>(() =>
    initialEmailUiState(requestKey),
  );
  const emailUi =
    emailState.key === requestKey
      ? emailState
      : initialEmailUiState(requestKey);
  const activeEmailKey = useRef(requestKey);
  const emailStatusRequestId = useRef(0);
  const emailOperation = useRef<{
    key: string;
    attemptAt: string | null;
    expectedDeliveryId: string | null;
  }>({ key: requestKey, attemptAt: null, expectedDeliveryId: null });
  const emailSubmissionLocks = useRef(new Set<string>());
  const automaticRefreshBudget = useRef<{
    key: string;
    deliveryId: string | null;
    attempts: number;
  }>({ key: requestKey, deliveryId: null, attempts: 0 });
  const emailTrigger = useRef<HTMLButtonElement>(null);
  const consentInput = useRef<HTMLInputElement>(null);
  const consentDialog = useRef<HTMLDialogElement>(null);
  const verifyEmailButton = useRef<HTMLButtonElement>(null);
  const emailStatusMessage = useRef<HTMLParagraphElement>(null);
  const emailErrorMessage = useRef<HTMLParagraphElement>(null);
  const hadEmailConsentOpen = useRef(false);
  const updateEmailState = useCallback(
    (key: string, update: (current: EmailUiState) => EmailUiState) => {
      setEmailState((current) => {
        if (activeEmailKey.current !== key) return current;
        return update(current.key === key ? current : initialEmailUiState(key));
      });
    },
    [],
  );
  useLayoutEffect(() => {
    activeEmailKey.current = requestKey;
    emailStatusRequestId.current += 1;
    emailOperation.current = {
      key: requestKey,
      attemptAt: null,
      expectedDeliveryId: null,
    };
    automaticRefreshBudget.current = {
      key: requestKey,
      deliveryId: null,
      attempts: 0,
    };
  }, [requestKey]);
  const finalizationConfirmed =
    (location.state as { finalizationConfirmed?: boolean } | null)
      ?.finalizationConfirmed === true;

  useEffect(() => {
    if (!entryId) return;
    const controller = new AbortController();
    const requestId = entryId;
    const requestIdentity = requestKey;
    void operations
      .entry(requestId, controller.signal)
      .then((entry) => {
        if (controller.signal.aborted) return;
        if (entry.id !== requestId) {
          setState({
            key: requestIdentity,
            entry: null,
            loading: false,
            error: "mismatch",
            retry: state.retry,
          });
        } else if (entry.status !== "completed") {
          setState({
            key: requestIdentity,
            entry,
            loading: false,
            error: "not-completed",
            retry: state.retry,
          });
        } else {
          setState({
            key: requestIdentity,
            entry,
            loading: false,
            error: "",
            retry: state.retry,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({
            key: requestIdentity,
            entry: null,
            loading: false,
            error: "unavailable",
            retry: state.retry,
          });
        }
      });
    return () => controller.abort();
  }, [entryId, requestKey, state.retry]);

  const entry = state.key === requestKey && state.entry ? state.entry : null;
  const loading =
    Boolean(entryId) && (state.key !== requestKey || state.loading);
  const error = !entryId
    ? "unavailable"
    : state.key === requestKey
      ? state.error
      : "";
  const printable =
    entry?.status === "completed" &&
    isRenderablePrescription(entry.prescription);
  const emailCapability = emailUi.capability;
  const emailLoading = emailUi.loading;
  const emailBusy = emailUi.busy;
  const emailUncertain = emailUi.uncertain;
  const emailError = emailUi.error;
  const showEmailConsent = emailUi.consentOpen;
  const emailConsent = emailUi.consent;
  const emailStatus = emailCapability?.latestDelivery?.status ?? null;
  const documentModel =
    printable && entry
      ? buildPrescriptionDocument(entry, entry.prescription!, {
          symptomNames: getEntrySymptomNames(userId, entry.id),
        })
      : null;
  usePageTitle(
    documentModel ? "Prescrição registrada" : "Prescrição do atendimento",
  );

  useEffect(() => {
    if (!printable) return;
    document.documentElement.dataset.prescriptionPrint = "true";
    return () => {
      if (document.documentElement.dataset.prescriptionPrint === "true")
        delete document.documentElement.dataset.prescriptionPrint;
    };
  }, [printable]);

  const refreshEmailStatus = useCallback(
    async (signal?: AbortSignal) => {
      const scope = requestKey;
      if (!entryId || !printable || activeEmailKey.current !== scope)
        return null;
      const requestId = ++emailStatusRequestId.current;
      const isLatestRequest = () =>
        activeEmailKey.current === scope &&
        emailStatusRequestId.current === requestId;
      updateEmailState(scope, (current) => ({
        ...current,
        loading: true,
        error: current.uncertain ? current.error : "",
      }));
      try {
        const status = await operations.prescriptionEmail(entryId, signal);
        if (signal?.aborted || !isLatestRequest()) return null;
        const operation = emailOperation.current;
        if (
          operation.key === scope &&
          operation.expectedDeliveryId &&
          status.latestDelivery?.deliveryId !== operation.expectedDeliveryId
        )
          return null;
        const attemptMatches = Boolean(
          operation.key === scope &&
          !operation.expectedDeliveryId &&
          operation.attemptAt &&
          status.latestDelivery &&
          Date.parse(status.latestDelivery.requestedAt) >=
            Date.parse(operation.attemptAt),
        );
        const confirmedDelivery = Boolean(
          operation.expectedDeliveryId &&
          status.latestDelivery?.deliveryId === operation.expectedDeliveryId,
        );
        const reconciledDelivery = confirmedDelivery || attemptMatches;
        updateEmailState(scope, (current) => ({
          ...current,
          capability: status,
          uncertain: reconciledDelivery ? false : current.uncertain,
          error: reconciledDelivery ? "" : current.error,
          idempotencyKey:
            reconciledDelivery && status.latestDelivery?.status === "failed"
              ? ""
              : current.idempotencyKey,
        }));
        if (reconciledDelivery && status.latestDelivery?.status === "failed") {
          emailOperation.current = {
            key: scope,
            attemptAt: null,
            expectedDeliveryId: null,
          };
        }
        const deliveryId = status.latestDelivery?.deliveryId ?? null;
        if (automaticRefreshBudget.current.key !== scope) {
          automaticRefreshBudget.current = {
            key: scope,
            deliveryId,
            attempts: 0,
          };
        } else if (automaticRefreshBudget.current.deliveryId !== deliveryId) {
          automaticRefreshBudget.current = {
            key: scope,
            deliveryId,
            attempts: 0,
          };
        }
        return status;
      } catch (cause) {
        if (!signal?.aborted && isLatestRequest())
          updateEmailState(scope, (current) => ({
            ...current,
            error:
              current.uncertain && current.error
                ? current.error
                : errorText(cause),
          }));
        return null;
      } finally {
        if (!signal?.aborted && isLatestRequest())
          updateEmailState(scope, (current) => ({
            ...current,
            loading: false,
          }));
      }
    },
    [entryId, printable, requestKey, updateEmailState],
  );

  useEffect(() => {
    if (!printable) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void refreshEmailStatus(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [printable, refreshEmailStatus]);

  useEffect(() => {
    const deliveryId = emailCapability?.latestDelivery?.deliveryId;
    if (
      !printable ||
      !deliveryId ||
      !emailStatus ||
      !["queued", "processing"].includes(emailStatus)
    )
      return;
    const refreshAutomatically = () => {
      if (
        document.visibilityState !== "visible" ||
        emailLoading ||
        emailBusy ||
        activeEmailKey.current !== requestKey
      )
        return;
      const budget = automaticRefreshBudget.current;
      if (budget.key !== requestKey || budget.deliveryId !== deliveryId) {
        automaticRefreshBudget.current = {
          key: requestKey,
          deliveryId,
          attempts: 0,
        };
      }
      if (automaticRefreshBudget.current.attempts >= 3) return;
      automaticRefreshBudget.current.attempts += 1;
      void refreshEmailStatus();
    };
    const timer = window.setInterval(() => {
      refreshAutomatically();
    }, 60000);
    window.addEventListener("focus", refreshAutomatically);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshAutomatically);
    };
  }, [
    emailBusy,
    emailCapability?.latestDelivery?.deliveryId,
    emailLoading,
    emailStatus,
    printable,
    refreshEmailStatus,
    requestKey,
  ]);

  useEffect(() => {
    if (showEmailConsent) {
      hadEmailConsentOpen.current = true;
      if (consentDialog.current && !consentDialog.current.open)
        consentDialog.current.showModal();
      consentInput.current?.focus();
    } else {
      if (consentDialog.current?.open) consentDialog.current.close();
      if (hadEmailConsentOpen.current) {
        hadEmailConsentOpen.current = false;
        if (emailUncertain) verifyEmailButton.current?.focus();
        else if (emailError) emailErrorMessage.current?.focus();
        else if (emailStatus && emailStatus !== "failed")
          emailStatusMessage.current?.focus();
        else emailTrigger.current?.focus();
      }
    }
  }, [showEmailConsent, emailStatus, emailUncertain, emailError]);

  async function downloadPdf() {
    if (!entry || !printable || pdfBusy) return;
    setPdfBusy(true);
    try {
      await openPrescriptionPdf(entry.id);
    } catch (cause) {
      toast.error("PDF indisponível", errorText(cause));
    } finally {
      setPdfBusy(false);
    }
  }

  async function requestEmail() {
    const scope = requestKey;
    if (
      !entry ||
      !printable ||
      !canRequestEmail(emailUi.capability) ||
      !emailConsent ||
      emailUi.busy ||
      emailUi.uncertain ||
      emailSubmissionLocks.current.has(scope)
    )
      return;
    emailSubmissionLocks.current.add(scope);
    updateEmailState(scope, (current) => ({
      ...current,
      busy: true,
      phase: "validating",
      error: "",
    }));
    let postStarted = false;
    try {
      const latest = await refreshEmailStatus();
      if (activeEmailKey.current !== scope) return;
      if (!latest) {
        updateEmailState(scope, (current) => ({
          ...current,
          consentOpen: false,
          consent: false,
        }));
        return;
      }
      if (!canRequestEmail(latest)) {
        const message = !latest.supported
          ? "O envio pelo Gmail está indisponível no servidor."
          : latest.latestDelivery && latest.latestDelivery.status !== "failed"
            ? "Já existe uma solicitação registrada para esta prescrição. Atualize o estado antes de solicitar outro envio."
            : "A prescrição não está elegível para envio. Confira o estado do atendimento.";
        updateEmailState(scope, (current) => ({
          ...current,
          error: message,
          consentOpen: false,
          consent: false,
        }));
        return;
      }
      const key = emailUi.idempotencyKey || crypto.randomUUID();
      updateEmailState(scope, (current) => ({
        ...current,
        idempotencyKey: key,
        phase: "submitting",
      }));
      emailOperation.current = {
        key: scope,
        attemptAt: new Date().toISOString(),
        expectedDeliveryId: null,
      };
      postStarted = true;
      const requested = await operations.requestPrescriptionEmail(
        entry.id,
        key,
      );
      if (activeEmailKey.current !== scope) return;
      emailOperation.current = {
        key: scope,
        attemptAt: requested.requestedAt,
        expectedDeliveryId: requested.deliveryId,
      };
      automaticRefreshBudget.current = {
        key: scope,
        deliveryId: requested.deliveryId,
        attempts: 0,
      };
      updateEmailState(scope, (current) => ({
        ...current,
        uncertain: false,
        capability: current.capability
          ? {
              ...current.capability,
              latestDelivery: {
                deliveryId: requested.deliveryId,
                status: requested.status,
                requestedAt: requested.requestedAt,
                updatedAt: requested.requestedAt,
                acceptedAt: null,
                deliveredAt: null,
                failureCode: null,
              },
            }
          : current.capability,
        consentOpen: false,
        consent: false,
      }));
      await refreshEmailStatus();
      if (activeEmailKey.current === scope)
        toast.info(
          "Solicitação registrada",
          "O HTTP 202 confirma que o pedido entrou no fluxo de processamento. O Gmail não confirma o recebimento pelo destinatário.",
        );
    } catch (cause) {
      if (activeEmailKey.current !== scope) return;
      const status =
        cause instanceof Error
          ? (cause as { status?: number }).status
          : undefined;
      const code =
        cause instanceof Error ? (cause as { code?: string }).code : undefined;
      const uncertain =
        postStarted &&
        (code === "TIMEOUT" ||
          code === "NETWORK_ERROR" ||
          status === 409 ||
          status === 429 ||
          status === 503);
      updateEmailState(scope, (current) => ({
        ...current,
        uncertain,
        error: uncertain
          ? "Não foi possível confirmar o resultado. O envio não será repetido automaticamente; consulte o estado antes de qualquer outra ação."
          : errorText(cause),
        consentOpen: false,
        consent: false,
      }));
      if (postStarted) await refreshEmailStatus();
    } finally {
      emailSubmissionLocks.current.delete(scope);
      if (activeEmailKey.current === scope)
        updateEmailState(scope, (current) => ({
          ...current,
          busy: false,
          phase: "idle",
        }));
    }
  }

  return (
    <AppShell>
      <div className="local-page operational-page prescription-preview-page">
        <header className="prescription-preview-screen-header">
          <div>
            <span className="local-eyebrow">
              Documento clínico · atendimento específico
            </span>
            <h1>
              {documentModel
                ? "Prescrição registrada"
                : "Prescrição do atendimento"}
            </h1>
            <p>
              {documentModel
                ? "A versão exibida vem do atendimento confirmado no servidor."
                : "A prescrição só será exibida após confirmar os dados do atendimento no servidor."}
            </p>
          </div>
          <Link className="local-secondary-button" to="/medico/historico">
            <ArrowLeft size={16} aria-hidden="true" /> Voltar ao histórico
          </Link>
        </header>

        {loading && (
          <p className="prescription-preview-status" role="status">
            Carregando documento confirmado…
          </p>
        )}
        {!loading && error === "unavailable" && (
          <section
            className="local-form prescription-preview-status"
            role="alert"
          >
            <h2>
              {finalizationConfirmed
                ? "Finalização confirmada; documento indisponível"
                : "Documento não disponível"}
            </h2>
            <p>
              {finalizationConfirmed
                ? "A operação de finalização foi confirmada, mas não foi possível carregar os dados persistidos. Verifique a sessão e tente consultar novamente."
                : "Não foi possível confirmar o acesso ao documento. A entrada pode não existir, não estar autorizada para esta sessão ou o serviço pode estar indisponível."}
            </p>
            <button
              type="button"
              className="local-secondary-button"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  loading: true,
                  error: "",
                  retry: current.retry + 1,
                }))
              }
            >
              <RefreshCw size={16} aria-hidden="true" /> Tentar carregar
              novamente
            </button>
          </section>
        )}
        {!loading && error === "mismatch" && (
          <p className="local-message is-error" role="alert">
            O servidor retornou outro atendimento. O documento foi bloqueado.
          </p>
        )}
        {!loading && error === "not-completed" && (
          <section
            className="local-form prescription-preview-status"
            role="alert"
          >
            <h2>Prescrição ainda indisponível</h2>
            <p>
              O atendimento consultado não está finalizado. Nenhum documento
              definitivo pode ser impresso.
            </p>
            <Link className="local-secondary-button" to="/medico/historico">
              <ArrowLeft size={16} aria-hidden="true" /> Voltar ao histórico
            </Link>
          </section>
        )}
        {!loading && entry && !printable && (
          <section
            className="local-form prescription-preview-status"
            role="alert"
          >
            <h2>Prescrição não disponível</h2>
            <p>
              A entrada está finalizada, mas o servidor não retornou uma
              prescrição legível. A impressão está bloqueada.
            </p>
            <button
              type="button"
              className="local-secondary-button"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  loading: true,
                  retry: current.retry + 1,
                }))
              }
            >
              Consultar novamente
            </button>
          </section>
        )}
        {!loading && documentModel && entry && (
          <>
            <div
              className="prescription-preview-actions"
              aria-label="Ações da prescrição confirmada"
            >
              <button
                type="button"
                className="local-primary"
                onClick={() => window.print()}
              >
                <Printer size={17} aria-hidden="true" /> Imprimir prescrição
              </button>
              <button
                type="button"
                className="local-secondary-button"
                onClick={() => void downloadPdf()}
                disabled={pdfBusy}
              >
                <Download size={17} aria-hidden="true" />{" "}
                {pdfBusy ? "Preparando PDF…" : "Baixar PDF"}
              </button>
              <button
                ref={emailTrigger}
                type="button"
                className="local-secondary-button"
                disabled={
                  emailLoading ||
                  !canRequestEmail(emailCapability) ||
                  emailBusy ||
                  emailUncertain
                }
                aria-describedby="prescription-email-help"
                onClick={() => {
                  updateEmailState(requestKey, (current) => ({
                    ...current,
                    consent: false,
                    error: "",
                    consentOpen: true,
                  }));
                }}
              >
                {emailBusy
                  ? emailUi.phase === "validating"
                    ? "Verificando disponibilidade…"
                    : "Solicitando envio…"
                  : "Enviar prescrição por e-mail"}
              </button>
              <p
                id="prescription-email-help"
                ref={emailStatusMessage}
                role="status"
                tabIndex={-1}
              >
                {emailLoading
                  ? "Consultando disponibilidade do serviço…"
                  : !emailCapability
                    ? "Aguardando consulta da disponibilidade do serviço…"
                    : !emailCapability?.supported
                      ? "O envio pelo Gmail não está habilitado no servidor."
                      : emailStatus && emailStatus !== "failed"
                        ? `${emailStatusLabel[emailStatus]}. Não é possível solicitar outro envio enquanto esta entrega estiver registrada.`
                        : !emailCapability.eligible
                          ? "Este atendimento não está elegível para novo envio por e-mail."
                          : emailStatus
                            ? emailStatusLabel[emailStatus]
                            : "O envio exige consentimento explícito do paciente."}
              </p>
              {emailCapability?.reasonCode && (
                <p className="local-note">
                  Motivo informado pelo servidor:{" "}
                  {emailCapability.reasonCode === "SERVICE_UNAVAILABLE"
                    ? "serviço indisponível"
                    : emailCapability.reasonCode === "RECIPIENT_NOT_ELIGIBLE"
                      ? "destinatário não elegível"
                      : "indisponível"}
                  .
                </p>
              )}
              {emailError && (
                <p
                  ref={emailErrorMessage}
                  className="prescription-form-error"
                  role="alert"
                  tabIndex={-1}
                >
                  {emailError}
                </p>
              )}
              {emailStatus && !emailUncertain && (
                <button
                  type="button"
                  className="local-secondary-button"
                  onClick={() => void refreshEmailStatus()}
                  disabled={emailLoading || emailBusy}
                >
                  {emailLoading
                    ? "Atualizando estado…"
                    : "Atualizar estado do envio"}
                </button>
              )}
              {emailUncertain && (
                <button
                  ref={verifyEmailButton}
                  type="button"
                  className="local-secondary-button"
                  onClick={() => void refreshEmailStatus()}
                  disabled={emailLoading}
                >
                  Verificar estado do envio
                </button>
              )}
              {emailStatus && (
                <p className="local-note" role="status">
                  Estado atual: {emailStatusLabel[emailStatus]}
                  {emailCapability?.latestDelivery?.failureCode
                    ? ". O servidor registrou uma falha; consulte a equipe responsável."
                    : ""}
                </p>
              )}
              {showEmailConsent && (
                <dialog
                  ref={consentDialog}
                  aria-labelledby="prescription-consent-title"
                  className="prescription-consent-dialog"
                  onCancel={(event) => {
                    event.preventDefault();
                    updateEmailState(requestKey, (current) => ({
                      ...current,
                      consentOpen: false,
                      consent: false,
                    }));
                  }}
                >
                  <h2 id="prescription-consent-title">
                    Confirmar envio da prescrição
                  </h2>
                  <p>
                    O servidor usará o endereço cadastrado para este paciente. A
                    solicitação não confirma entrega.
                  </p>
                  <label>
                    <input
                      ref={consentInput}
                      type="checkbox"
                      checked={emailConsent}
                      onChange={(event) =>
                        updateEmailState(requestKey, (current) => ({
                          ...current,
                          consent: event.target.checked,
                        }))
                      }
                    />{" "}
                    Confirmo que o paciente consentiu com o envio desta
                    prescrição por e-mail.
                  </label>
                  <div className="local-actions">
                    <button
                      type="button"
                      className="local-secondary-button"
                      onClick={() => {
                        updateEmailState(requestKey, (current) => ({
                          ...current,
                          consentOpen: false,
                          consent: false,
                        }));
                      }}
                    >
                      Cancelar
                    </button>
                    {emailBusy && (
                      <p role="status">
                        {emailUi.phase === "validating"
                          ? "Verificando a disponibilidade e a elegibilidade no servidor…"
                          : "Registrando a solicitação no servidor…"}
                      </p>
                    )}
                    <button
                      type="button"
                      className="local-primary"
                      disabled={!emailConsent || emailBusy}
                      onClick={() => void requestEmail()}
                    >
                      {emailBusy
                        ? emailUi.phase === "validating"
                          ? "Verificando…"
                          : "Solicitando…"
                        : "Confirmar e solicitar"}
                    </button>
                  </div>
                </dialog>
              )}
            </div>
            <PrescriptionDocument document={documentModel} />
          </>
        )}
      </div>
    </AppShell>
  );
}

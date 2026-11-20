import { useCallback, useEffect, useRef, useState } from "react";
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
  queued: "Solicitação na fila",
  processing: "Envio em processamento",
  accepted: "E-mail aceito pelo provedor; entrega ainda não confirmada",
  delivery_delayed: "Entrega atrasada; aguardando atualização do provedor",
  delivered: "E-mail entregue",
  failed: "Envio falhou",
  unknown: "Estado do envio desconhecido",
};

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
  const [emailCapability, setEmailCapability] =
    useState<PrescriptionEmailResult | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailUncertain, setEmailUncertain] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [showEmailConsent, setShowEmailConsent] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);
  const [emailIdempotencyKey, setEmailIdempotencyKey] = useState("");
  const emailAttemptAt = useRef<string | null>(null);
  const expectedDeliveryId = useRef<string | null>(null);
  const emailTrigger = useRef<HTMLButtonElement>(null);
  const consentInput = useRef<HTMLInputElement>(null);
  const consentDialog = useRef<HTMLDialogElement>(null);
  const verifyEmailButton = useRef<HTMLButtonElement>(null);
  const emailStatusMessage = useRef<HTMLParagraphElement>(null);
  const hadEmailConsentOpen = useRef(false);
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
      if (!entryId || !printable) return null;
      setEmailLoading(true);
      try {
        const status = await operations.prescriptionEmail(entryId, signal);
        if (!signal?.aborted) {
          setEmailCapability((current) => {
            if (
              expectedDeliveryId.current &&
              current?.latestDelivery?.deliveryId ===
                expectedDeliveryId.current &&
              status.latestDelivery?.deliveryId !== expectedDeliveryId.current
            )
              return { ...status, latestDelivery: current.latestDelivery };
            return status;
          });
          if (
            expectedDeliveryId.current &&
            status.latestDelivery?.deliveryId === expectedDeliveryId.current
          ) {
            setEmailUncertain(false);
            if (status.latestDelivery.status === "failed") {
              setEmailIdempotencyKey("");
              emailAttemptAt.current = null;
              expectedDeliveryId.current = null;
            }
          } else if (
            !expectedDeliveryId.current &&
            emailAttemptAt.current &&
            status.latestDelivery &&
            new Date(status.latestDelivery.requestedAt).getTime() >=
              new Date(emailAttemptAt.current).getTime()
          ) {
            setEmailUncertain(false);
            if (status.latestDelivery.status === "failed") {
              setEmailIdempotencyKey("");
              emailAttemptAt.current = null;
            }
          }
        }
        return status;
      } catch (cause) {
        if (!signal?.aborted) setEmailError(errorText(cause));
        return null;
      } finally {
        if (!signal?.aborted) setEmailLoading(false);
      }
    },
    [entryId, printable],
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
    if (
      !printable ||
      !emailStatus ||
      ![
        "queued",
        "processing",
        "accepted",
        "delivery_delayed",
        "unknown",
      ].includes(emailStatus)
    )
      return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshEmailStatus();
    }, 60000);
    const onFocus = () => void refreshEmailStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [emailStatus, printable, refreshEmailStatus]);

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
        else if (emailStatus && emailStatus !== "failed")
          emailStatusMessage.current?.focus();
        else emailTrigger.current?.focus();
      }
    }
  }, [showEmailConsent, emailStatus, emailUncertain]);

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
    if (
      !entry ||
      !printable ||
      !emailCapability?.supported ||
      !emailCapability.eligible ||
      !emailConsent ||
      emailBusy
    )
      return;
    const key = emailIdempotencyKey || crypto.randomUUID();
    setEmailIdempotencyKey(key);
    emailAttemptAt.current = new Date().toISOString();
    setEmailBusy(true);
    setEmailError("");
    try {
      const requested = await operations.requestPrescriptionEmail(
        entry.id,
        key,
      );
      setEmailUncertain(false);
      emailAttemptAt.current = requested.requestedAt;
      expectedDeliveryId.current = requested.deliveryId;
      setEmailCapability((current) =>
        current
          ? {
              ...current,
              latestDelivery: {
                deliveryId: requested.deliveryId,
                status: requested.status,
                requestedAt: requested.requestedAt,
                updatedAt: requested.requestedAt,
                acceptedAt:
                  requested.status === "accepted"
                    ? requested.requestedAt
                    : null,
                deliveredAt:
                  requested.status === "delivered"
                    ? requested.requestedAt
                    : null,
                failureCode: null,
              },
            }
          : current,
      );
      setShowEmailConsent(false);
      setEmailConsent(false);
      await refreshEmailStatus();
      toast.info(
        "Solicitação registrada",
        "O HTTP 202 confirma que o pedido foi aceito para processamento, não que o e-mail foi entregue.",
      );
    } catch (cause) {
      const status =
        cause instanceof Error
          ? (cause as { status?: number }).status
          : undefined;
      const code =
        cause instanceof Error ? (cause as { code?: string }).code : undefined;
      const uncertain =
        code === "TIMEOUT" ||
        code === "NETWORK_ERROR" ||
        status === 409 ||
        status === 429 ||
        status === 503;
      setEmailUncertain(uncertain);
      setEmailError(
        uncertain
          ? "Não foi possível confirmar o resultado. O envio não será repetido automaticamente; consulte o estado antes de qualquer outra ação."
          : errorText(cause),
      );
      setShowEmailConsent(false);
      setEmailConsent(false);
      await refreshEmailStatus();
    } finally {
      setEmailBusy(false);
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
                  !emailCapability?.supported ||
                  !emailCapability?.eligible ||
                  emailBusy ||
                  emailUncertain ||
                  Boolean(emailStatus && emailStatus !== "failed")
                }
                aria-describedby="prescription-email-help"
                onClick={() => {
                  setEmailConsent(false);
                  setEmailError("");
                  setShowEmailConsent(true);
                }}
              >
                {emailBusy
                  ? "Solicitando envio…"
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
                  : !emailCapability?.supported
                    ? "O serviço de envio não está habilitado no servidor."
                    : !emailCapability.eligible
                      ? "Este atendimento não está elegível para envio por e-mail."
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
                <p className="prescription-form-error" role="alert">
                  {emailError}
                </p>
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
                    setShowEmailConsent(false);
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
                        setEmailConsent(event.target.checked)
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
                        setShowEmailConsent(false);
                        setEmailConsent(false);
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="local-primary"
                      disabled={!emailConsent || emailBusy}
                      onClick={() => void requestEmail()}
                    >
                      {emailBusy ? "Solicitando…" : "Confirmar e solicitar"}
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

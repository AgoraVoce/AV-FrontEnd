import { useEffect, useState } from "react";
import { ArrowLeft, Download, Printer, RefreshCw } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AppShell } from "../../components/AppShell";
import { usePageTitle } from "../../components/usePageTitle";
import { useToast } from "../../components/useToast";
import type { EntryDetail } from "../../integrations/operational-api";
import { operations } from "../../integrations/operational-api";
import { openPrescriptionPdf } from "../../integrations/extended-api";
import { errorText } from "../../integrations/shared-helpers";
import { useAuth } from "../../auth/context";
import { getEntrySymptomNames } from "./draft-store";
import { buildPrescriptionDocument, isRenderablePrescription } from "./model";
import { PrescriptionDocument } from "./PrescriptionDocument";
import "./prescription.css";
import "./prescription-print.css";

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
                type="button"
                className="prescription-email-unavailable"
                disabled
                aria-describedby="prescription-email-help"
              >
                Enviar prescrição por e-mail
              </button>
              <p id="prescription-email-help">
                O envio depende de integração segura no servidor.
              </p>
            </div>
            <PrescriptionDocument document={documentModel} />
          </>
        )}
      </div>
    </AppShell>
  );
}

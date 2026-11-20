import { useEffect, useRef, type FormEvent } from "react";
import {
  ArrowLeft,
  ClipboardCheck,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { EntryDetail } from "../../integrations/operational-api";
import {
  buildPrescriptionDocument,
  formatClinicalDate,
  prescriptionFromDraft,
} from "./model";
import { PrescriptionDocument } from "./PrescriptionDocument";
import { createDraftMedicationId, type PrescriptionDraft } from "./draft-store";

type Props = {
  entry: EntryDetail;
  draft: PrescriptionDraft;
  errors: Record<string, string>;
  review: boolean;
  busy: boolean;
  finalizationError: string;
  finalizationUncertain: boolean;
  syncStatus: "loading" | "saved" | "dirty" | "saving" | "error" | "conflict";
  syncMessage: string;
  canReview: boolean;
  canDiscard: boolean;
  onRetrySave: () => void;
  onReloadServer: () => void;
  onDiscardDraft: () => void;
  symptomNames: string[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (field: "description" | "notes", value: string) => void;
  onMedicationChange: (
    draftId: string,
    field: "name" | "dosage" | "instructions",
    value: string,
  ) => void;
  onAddMedication: (draftId: string) => void;
  onRemoveMedication: (draftId: string) => void;
  onEdit: () => void;
  onVerify: () => void;
  onBack: () => void;
};

function fieldErrorId(key: string) {
  return `prescription-${key}-error`;
}

function LocalizedError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="prescription-field-error" id={id}>
      {message}
    </span>
  ) : null;
}

export function PrescriptionForm({
  entry,
  draft,
  errors,
  review,
  busy,
  finalizationError,
  finalizationUncertain,
  syncStatus,
  syncMessage,
  canReview,
  canDiscard,
  onRetrySave,
  onReloadServer,
  onDiscardDraft,
  symptomNames,
  onSubmit,
  onChange,
  onMedicationChange,
  onAddMedication,
  onRemoveMedication,
  onEdit,
  onVerify,
  onBack,
}: Props) {
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const descriptionField = useRef<HTMLTextAreaElement>(null);
  const wasReview = useRef(false);

  useEffect(() => {
    if (review) reviewHeading.current?.focus();
    else if (wasReview.current) descriptionField.current?.focus();
    wasReview.current = review;
  }, [review]);

  const documentModel = buildPrescriptionDocument(
    entry,
    prescriptionFromDraft(draft),
    {
      draft: true,
      symptomNames,
    },
  );

  return (
    <form
      onSubmit={onSubmit}
      className="operational-prescription prescription-form"
      aria-label="Prescrição e finalização"
      noValidate
    >
      <div className="operational-row">
        <h3>Prescrição e finalização</h3>
        <span className="local-note">Campos obrigatórios marcados com *</span>
      </div>

      <div
        className="prescription-context"
        aria-label="Contexto do atendimento, somente leitura"
      >
        <h4>Atendimento atual</h4>
        <dl>
          <div>
            <dt>Paciente</dt>
            <dd>{entry.patient.fullName || "Não informado"}</dd>
          </div>
          <div>
            <dt>Senha</dt>
            <dd>{entry.queueCode || "Não informada"}</dd>
          </div>
          <div>
            <dt>Médico responsável</dt>
            <dd>{entry.doctor?.name || "Não informado"}</dd>
          </div>
          <div>
            <dt>Início</dt>
            <dd>
              {formatClinicalDate(entry.timestamps.startedAt) ||
                "Não informado"}
            </dd>
          </div>
          {entry.room && (
            <div>
              <dt>Sala</dt>
              <dd>{entry.room}</dd>
            </div>
          )}
          {entry.otherSymptoms && (
            <div>
              <dt>Queixa registrada</dt>
              <dd>{entry.otherSymptoms}</dd>
            </div>
          )}
          {(entry.symptomIds?.length ?? 0) > 0 && symptomNames.length === 0 && (
            <div>
              <dt>Sintomas estruturados</dt>
              <dd>Nomes não disponíveis neste detalhe.</dd>
            </div>
          )}
          {symptomNames.length > 0 && (
            <div>
              <dt>Sintomas registrados</dt>
              <dd>{symptomNames.join(" · ")}</dd>
            </div>
          )}
        </dl>
      </div>

      <div
        className="prescription-draft-note"
        role={
          syncStatus === "error" || syncStatus === "conflict"
            ? "alert"
            : "status"
        }
        aria-live="polite"
      >
        {syncStatus === "loading" && "Recuperando rascunho salvo…"}
        {syncStatus === "saving" && "Salvando rascunho…"}
        {syncStatus === "saved" &&
          (syncMessage || "Rascunho salvo no servidor.")}
        {syncStatus === "dirty" && "Alterações aguardando salvamento."}
        {syncStatus === "error" &&
          (syncMessage || "Falha ao salvar. O conteúdo continua em memória.")}
        {syncStatus === "conflict" &&
          (syncMessage ||
            "Conflito de versão. Seus dados em edição foram preservados.")}
        {syncStatus === "error" && draft.changed && (
          <button
            type="button"
            className="local-secondary-button"
            onClick={onRetrySave}
          >
            Tentar salvar novamente
          </button>
        )}
        {syncStatus === "error" && !draft.changed && (
          <button
            type="button"
            className="local-secondary-button"
            onClick={onReloadServer}
          >
            Tentar recuperar rascunho
          </button>
        )}
        {syncStatus === "conflict" && (
          <button
            type="button"
            className="local-secondary-button"
            onClick={onReloadServer}
          >
            Carregar versão do servidor
          </button>
        )}
      </div>

      {finalizationError && (
        <div className="prescription-form-error" role="alert">
          <ShieldAlert size={18} aria-hidden="true" />
          <p>{finalizationError}</p>
          {finalizationUncertain && (
            <button
              type="button"
              className="local-secondary-button"
              onClick={onVerify}
              disabled={busy}
            >
              Verificar situação no servidor
            </button>
          )}
        </div>
      )}

      {review ? (
        <section
          className="prescription-review"
          aria-labelledby="prescription-review-title"
        >
          <div className="prescription-review-heading">
            <h4
              id="prescription-review-title"
              ref={reviewHeading}
              tabIndex={-1}
            >
              Revisar antes de finalizar
            </h4>
            <p>
              Confira o atendimento e todo o conteúdo que será gravado. A
              pré-visualização não pode ser impressa como prescrição definitiva.
            </p>
          </div>
          <PrescriptionDocument document={documentModel} />
          <div
            className="operational-confirm"
            role="group"
            aria-label="Confirmação da finalização"
          >
            <strong>A finalização encerra este atendimento.</strong>
            <p>
              O servidor grava a prescrição e o encerramento na mesma operação.
              O envio por e-mail não está disponível.
            </p>
          </div>
        </section>
      ) : (
        <fieldset
          className="prescription-fields"
          disabled={busy || finalizationUncertain}
        >
          <legend className="sr-only">Conteúdo da prescrição</legend>
          <div className="local-fields">
            <label className="local-wide" htmlFor="prescription-description">
              Descrição / conduta clínica <span aria-hidden="true">*</span>
              <textarea
                ref={descriptionField}
                id="prescription-description"
                value={draft.description}
                maxLength={5000}
                rows={6}
                aria-required="true"
                aria-invalid={Boolean(errors.description)}
                aria-describedby={`prescription-description-help${errors.description ? ` ${fieldErrorId("description")}` : ""}`}
                onChange={(event) =>
                  onChange("description", event.target.value)
                }
                placeholder="Registre a conduta deste atendimento."
              />
              <span
                className="prescription-field-help"
                id="prescription-description-help"
              >
                Obrigatória, até 5.000 caracteres. Texto exibido literalmente.
              </span>
              <LocalizedError
                id={fieldErrorId("description")}
                message={errors.description}
              />
              <span className="prescription-character-count">
                {draft.description.length}/5.000
              </span>
            </label>
          </div>

          <div className="operational-row prescription-medications-heading">
            <div>
              <h4>Medicamentos</h4>
              <p>
                Opcional. Adicione somente quando houver medicação prescrita.
                Máximo de 50.
              </p>
            </div>
            <button
              type="button"
              className="local-secondary-button operational-small-button"
              id="prescription-add-medication"
              disabled={draft.medications.length >= 50 || busy}
              onClick={() => {
                const draftId = createDraftMedicationId();
                onAddMedication(draftId);
                window.requestAnimationFrame(() =>
                  document
                    .getElementById(`prescription-med-${draftId}-name`)
                    ?.focus(),
                );
              }}
            >
              <Plus size={16} aria-hidden="true" /> Adicionar medicamento
            </button>
          </div>

          {draft.medications.length === 0 ? (
            <p className="prescription-no-medications">
              Nenhum medicamento adicionado.
            </p>
          ) : (
            draft.medications.map((medication, index) => {
              const nameKey = `med-${medication.draftId}-name`;
              const dosageKey = `med-${medication.draftId}-dosage`;
              const instructionsKey = `med-${medication.draftId}-instructions`;
              return (
                <fieldset
                  className="operational-medication prescription-medication"
                  key={medication.draftId}
                >
                  <legend>Medicamento {index + 1}</legend>
                  <div className="local-fields">
                    <label
                      htmlFor={`prescription-med-${medication.draftId}-name`}
                    >
                      Nome <span aria-hidden="true">*</span>
                      <input
                        id={`prescription-med-${medication.draftId}-name`}
                        maxLength={150}
                        value={medication.name}
                        aria-required="true"
                        aria-invalid={Boolean(errors[nameKey])}
                        aria-describedby={
                          errors[nameKey] ? fieldErrorId(nameKey) : undefined
                        }
                        onChange={(event) =>
                          onMedicationChange(
                            medication.draftId,
                            "name",
                            event.target.value,
                          )
                        }
                      />
                      <LocalizedError
                        id={fieldErrorId(nameKey)}
                        message={errors[nameKey]}
                      />
                    </label>
                    <label
                      htmlFor={`prescription-med-${medication.draftId}-dosage`}
                    >
                      Dosagem <span aria-hidden="true">*</span>
                      <input
                        id={`prescription-med-${medication.draftId}-dosage`}
                        maxLength={150}
                        value={medication.dosage}
                        aria-required="true"
                        aria-invalid={Boolean(errors[dosageKey])}
                        aria-describedby={
                          errors[dosageKey]
                            ? fieldErrorId(dosageKey)
                            : undefined
                        }
                        onChange={(event) =>
                          onMedicationChange(
                            medication.draftId,
                            "dosage",
                            event.target.value,
                          )
                        }
                      />
                      <LocalizedError
                        id={fieldErrorId(dosageKey)}
                        message={errors[dosageKey]}
                      />
                    </label>
                    <label
                      className="local-wide"
                      htmlFor={`prescription-med-${medication.draftId}-instructions`}
                    >
                      Instruções <span aria-hidden="true">*</span>
                      <textarea
                        id={`prescription-med-${medication.draftId}-instructions`}
                        maxLength={1000}
                        rows={2}
                        value={medication.instructions}
                        aria-required="true"
                        aria-invalid={Boolean(errors[instructionsKey])}
                        aria-describedby={
                          errors[instructionsKey]
                            ? fieldErrorId(instructionsKey)
                            : undefined
                        }
                        onChange={(event) =>
                          onMedicationChange(
                            medication.draftId,
                            "instructions",
                            event.target.value,
                          )
                        }
                      />
                      <LocalizedError
                        id={fieldErrorId(instructionsKey)}
                        message={errors[instructionsKey]}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="operational-inline operational-danger"
                    onClick={() => {
                      const next =
                        draft.medications[index + 1] ??
                        draft.medications[index - 1];
                      onRemoveMedication(medication.draftId);
                      window.requestAnimationFrame(() =>
                        document
                          .getElementById(
                            next
                              ? `prescription-med-${next.draftId}-name`
                              : "prescription-add-medication",
                          )
                          ?.focus(),
                      );
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" /> Remover medicamento{" "}
                    {index + 1}
                  </button>
                </fieldset>
              );
            })
          )}

          <div className="local-fields">
            <label className="local-wide" htmlFor="prescription-notes">
              Orientações adicionais
              <textarea
                id="prescription-notes"
                maxLength={4000}
                rows={3}
                value={draft.notes}
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={`prescription-notes-help${errors.notes ? ` ${fieldErrorId("notes")}` : ""}`}
                onChange={(event) => onChange("notes", event.target.value)}
              />
              <span
                className="prescription-field-help"
                id="prescription-notes-help"
              >
                Opcional, até 4.000 caracteres.
              </span>
              <LocalizedError
                id={fieldErrorId("notes")}
                message={errors.notes}
              />
              <span className="prescription-character-count">
                {draft.notes.length}/4.000
              </span>
            </label>
          </div>
        </fieldset>
      )}

      <div className="local-actions prescription-actions">
        {review ? (
          <>
            <button
              className="local-primary"
              type="submit"
              disabled={busy || finalizationUncertain || !canReview}
            >
              <ClipboardCheck size={17} aria-hidden="true" />{" "}
              {busy ? "Finalizando atendimento…" : "Confirmar finalização"}
            </button>
            <button
              className="local-secondary-button"
              type="button"
              onClick={onEdit}
              disabled={busy}
            >
              Voltar para edição
            </button>
          </>
        ) : (
          <>
            <button
              className="local-primary"
              type="submit"
              disabled={busy || finalizationUncertain || !canReview}
            >
              {busy ? "Aguarde…" : "Revisar antes de finalizar"}
            </button>
            <button
              className="local-secondary-button"
              type="button"
              onClick={onBack}
              disabled={busy}
            >
              <ArrowLeft size={16} aria-hidden="true" /> Voltar ao atendimento
            </button>
          </>
        )}
        {canDiscard && !review && (
          <button
            type="button"
            className="operational-inline operational-danger"
            onClick={onDiscardDraft}
            disabled={busy}
          >
            Descartar rascunho salvo
          </button>
        )}
      </div>
    </form>
  );
}

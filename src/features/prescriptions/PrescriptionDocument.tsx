import type { ReactNode } from "react";
import type { PrescriptionDocumentViewModel } from "./model";

function DocumentField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="prescription-document-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function PrescriptionDocument({
  document,
}: {
  document: PrescriptionDocumentViewModel;
}) {
  return (
    <article
      className="prescription-document"
      aria-labelledby="prescription-document-title"
    >
      <header className="prescription-document-header">
        <div>
          <p className="prescription-document-kicker">
            Documento do atendimento
          </p>
          <h1 id="prescription-document-title">Prescrição / Conduta</h1>
        </div>
        <p
          className={
            document.draft
              ? "prescription-document-status is-draft"
              : "prescription-document-status"
          }
        >
          {document.draft
            ? "Pré-visualização — conteúdo não salvo"
            : "Prescrição registrada"}
        </p>
      </header>

      <section
        className="prescription-document-section"
        aria-labelledby="prescription-identification-title"
      >
        <h2 id="prescription-identification-title">
          Identificação do atendimento
        </h2>
        <dl className="prescription-document-fields">
          <DocumentField label="Paciente">{document.patientName}</DocumentField>
          {document.queueCode && (
            <DocumentField label="Senha">{document.queueCode}</DocumentField>
          )}
          <DocumentField label="Médico responsável">
            {document.doctorName}
          </DocumentField>
          <DocumentField label={document.dateLabel}>
            {document.dateValue}
          </DocumentField>
          {document.room && (
            <DocumentField label="Sala">{document.room}</DocumentField>
          )}
          {document.symptomNames.length > 0 && (
            <DocumentField label="Sintomas registrados">
              {document.symptomNames.join(" · ")}
            </DocumentField>
          )}
          {document.structuredSymptomsUnavailable && (
            <DocumentField label="Sintomas estruturados">
              Nomes não disponíveis neste detalhe.
            </DocumentField>
          )}
          {document.otherSymptoms && (
            <DocumentField label="Queixa relatada">
              {document.otherSymptoms}
            </DocumentField>
          )}
          {document.shortNote && (
            <DocumentField label="Observação de entrada">
              {document.shortNote}
            </DocumentField>
          )}
        </dl>
      </section>

      <section
        className="prescription-document-section"
        aria-labelledby="prescription-description-title"
      >
        <h2 id="prescription-description-title">Descrição / conduta clínica</h2>
        <p className="prescription-document-text">
          {document.prescription.description}
        </p>
      </section>

      <section
        className="prescription-document-section"
        aria-labelledby="prescription-medications-title"
      >
        <h2 id="prescription-medications-title">Medicamentos</h2>
        {document.prescription.medications.length === 0 ? (
          <p className="prescription-document-muted">
            Sem medicamentos prescritos.
          </p>
        ) : (
          <ol className="prescription-document-medications">
            {document.prescription.medications.map((medication, index) => (
              <li
                key={`${index}-${medication.name}`}
                className="prescription-document-medication"
              >
                <h3>{medication.name}</h3>
                <p>
                  <strong>Dosagem:</strong> {medication.dosage}
                </p>
                <p className="prescription-document-text">
                  <strong>Instruções:</strong> {medication.instructions}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {document.prescription.notes?.trim() && (
        <section
          className="prescription-document-section"
          aria-labelledby="prescription-notes-title"
        >
          <h2 id="prescription-notes-title">Orientações adicionais</h2>
          <p className="prescription-document-text">
            {document.prescription.notes}
          </p>
        </section>
      )}
    </article>
  );
}

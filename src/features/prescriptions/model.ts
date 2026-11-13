import type {
  EntryDetail,
  Prescription,
} from "../../integrations/operational-api";
import type { PrescriptionDraft } from "./draft-store";

export type PrescriptionDocumentViewModel = {
  patientName: string;
  queueCode: string | null;
  doctorName: string;
  dateLabel: string;
  dateValue: string;
  symptomNames: string[];
  structuredSymptomsUnavailable: boolean;
  otherSymptoms: string | null;
  shortNote: string | null;
  room: string | null;
  prescription: Prescription;
  draft: boolean;
};

export function formatClinicalDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function usableText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildPrescriptionDocument(
  entry: EntryDetail,
  prescription: Prescription,
  options: { draft?: boolean; symptomNames?: string[] } = {},
): PrescriptionDocumentViewModel {
  const symptomNames = (options.symptomNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  const hasStructuredSymptoms = (entry.symptomIds?.length ?? 0) > 0;
  const visitDate = usableText(entry.timestamps?.startedAt);
  const prescriptionDate = usableText(entry.prescription?.createdAt);
  const dateSource = visitDate ?? prescriptionDate ?? entry.enteredAt;
  const dateLabel = visitDate
    ? "Início do atendimento"
    : prescriptionDate
      ? "Registro da prescrição"
      : "Entrada registrada";

  return {
    patientName: usableText(entry.patient?.fullName) ?? "Não informado",
    queueCode: usableText(entry.queueCode),
    doctorName: usableText(entry.doctor?.name) ?? "Não informado",
    dateLabel,
    dateValue: formatClinicalDate(dateSource) || "Não informado",
    symptomNames,
    structuredSymptomsUnavailable:
      hasStructuredSymptoms && symptomNames.length === 0,
    otherSymptoms: usableText(entry.otherSymptoms),
    shortNote: usableText(entry.shortNote),
    room: usableText(entry.room),
    prescription,
    draft: options.draft === true,
  };
}

export function prescriptionFromDraft(draft: PrescriptionDraft): Prescription {
  return {
    description: draft.description.trim(),
    medications: draft.medications.map((item) => ({
      name: item.name.trim(),
      dosage: item.dosage.trim(),
      instructions: item.instructions.trim(),
    })),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
  };
}

export function isRenderablePrescription(
  value: unknown,
): value is Prescription {
  if (!value || typeof value !== "object") return false;
  const prescription = value as Partial<Prescription>;
  const description = prescription.description;
  const medications = prescription.medications;
  const notes = prescription.notes;
  return (
    typeof description === "string" &&
    description.trim().length > 0 &&
    description.length <= 5000 &&
    (notes === undefined ||
      notes === null ||
      (typeof notes === "string" && notes.length <= 4000)) &&
    Array.isArray(medications) &&
    medications.length <= 50 &&
    medications.every(
      (item) =>
        item &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        item.name.length <= 150 &&
        typeof item.dosage === "string" &&
        item.dosage.trim().length > 0 &&
        item.dosage.length <= 150 &&
        typeof item.instructions === "string" &&
        item.instructions.trim().length > 0 &&
        item.instructions.length <= 1000,
    )
  );
}

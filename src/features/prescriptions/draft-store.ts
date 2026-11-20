import type { Medication } from "../../integrations/operational-api";

export type DraftMedication = Medication & { draftId: string };
export type PrescriptionDraft = {
  description: string;
  medications: DraftMedication[];
  notes: string;
  changed: boolean;
};

const drafts = new Map<string, PrescriptionDraft>();
const draftEtags = new Map<string, string>();
const availableSymptoms = new Map<string, string[]>();
let nextDraftId = 0;

function contextKey(userId: string, entryId: string) {
  return JSON.stringify([userId, entryId]);
}

export function createDraftMedicationId() {
  nextDraftId += 1;
  return `med-${nextDraftId}`;
}

export function emptyPrescriptionDraft(): PrescriptionDraft {
  return { description: "", medications: [], notes: "", changed: false };
}

function copyDraft(draft: PrescriptionDraft): PrescriptionDraft {
  return {
    ...draft,
    medications: draft.medications.map((item) => ({ ...item })),
  };
}

export function getPrescriptionDraft(userId: string, entryId: string) {
  const draft = drafts.get(contextKey(userId, entryId));
  return draft ? copyDraft(draft) : emptyPrescriptionDraft();
}

export function setPrescriptionDraft(
  userId: string,
  entryId: string,
  draft: PrescriptionDraft,
) {
  drafts.set(contextKey(userId, entryId), copyDraft(draft));
}

export function clearPrescriptionDraft(userId: string, entryId: string) {
  drafts.delete(contextKey(userId, entryId));
  draftEtags.delete(contextKey(userId, entryId));
}

export function getPrescriptionDraftEtag(userId: string, entryId: string) {
  return draftEtags.get(contextKey(userId, entryId)) ?? null;
}

export function setPrescriptionDraftEtag(
  userId: string,
  entryId: string,
  etag: string | null,
) {
  const key = contextKey(userId, entryId);
  if (etag) draftEtags.set(key, etag);
  else draftEtags.delete(key);
}

export function setEntrySymptomNames(
  userId: string,
  entryId: string,
  names: string[],
) {
  availableSymptoms.set(contextKey(userId, entryId), [...names]);
}

export function getEntrySymptomNames(userId: string, entryId: string) {
  return [...(availableSymptoms.get(contextKey(userId, entryId)) ?? [])];
}

export function clearPrescriptionMemory() {
  drafts.clear();
  draftEtags.clear();
  availableSymptoms.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("av:auth-context-changed", clearPrescriptionMemory);
}

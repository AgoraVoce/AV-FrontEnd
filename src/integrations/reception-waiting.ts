import { ApiError, getWaitingQueue, type WaitingItem } from "./client";
import type { EntryStatus, Severity } from "./operational-api";
import { priorityInfo } from "./priority-store";

export type ReceptionQueueItem = WaitingItem & {
  clinical?: {
    severity: Severity;
    status: EntryStatus;
    enteredAt: string;
    complaint: string;
  };
};

/** Normalize the exact expanded contract from backend commit 25962c7.
 * Old deployments remain supported without resending writes or guessing clinical values.
 */
export async function getReceptionWaitingQueue(
  signal?: AbortSignal,
): Promise<ReceptionQueueItem[]> {
  const items = await getWaitingQueue(signal);
  return items.map((item) => {
    const raw = item as unknown as Record<string, unknown>;
    if (!["gravidade", "horarioEntrada", "queixa"].some((key) => key in raw))
      return item;
    if (
      !priorityInfo(raw.gravidade as Severity) ||
      raw.status !== "aguardando" ||
      typeof raw.horarioEntrada !== "string" ||
      !Number.isFinite(Date.parse(raw.horarioEntrada)) ||
      typeof raw.queixa !== "string" ||
      ("id" in raw && raw.id !== item.entryId) ||
      ("nome" in raw && raw.nome !== item.fullName) ||
      ("senha" in raw && raw.senha !== item.queueCode)
    ) {
      throw new ApiError(
        502,
        "BAD_RESPONSE",
        "A fila ampliada retornou dados clínicos inválidos. Atualize a fila antes de prosseguir.",
      );
    }
    return {
      ...item,
      clinical: {
        severity: raw.gravidade as Severity,
        status: "waiting",
        enteredAt: raw.horarioEntrada,
        complaint: raw.queixa,
      },
    };
  });
}

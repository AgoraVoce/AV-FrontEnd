import { operations, type EntryDetail } from "./operational-api";
import type { WaitingItem } from "./client";

/** The waiting endpoint is minimal. Enrich from existing details without changing its contract.
 * TODO: Use a bulk queue response when the backend exposes the clinical fields there.
 * Bound concurrency and abort on refresh/unmount. One failed detail never hides the whole queue.
 */
export async function loadReceptionClinicalData(
  items: WaitingItem[],
  signal: AbortSignal,
) {
  const details: Record<string, EntryDetail> = {};
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (!signal.aborted && next < items.length) {
        const item = items[next++];
        try {
          const detail = await operations.entry(item.entryId, signal);
          if (!signal.aborted && detail.id === item.entryId)
            details[item.entryId] = detail;
        } catch {
          // A missing/unavailable detail stays unknown; never infer clinical values.
        }
      }
    }),
  );
  signal.throwIfAborted();
  return details;
}

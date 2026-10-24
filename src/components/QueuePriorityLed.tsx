import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import type { Severity } from "../integrations/operational-api";
import "./queue-priority-led.css";

// UI success event: emit only after persistence succeeds (local today, API later).
// A unique event ID restarts the effect even for consecutive changes to the same entry.
export type PrioritySavedFeedback = {
  id: string;
  entryId: string;
  level: Severity;
};
const PRESENTATION = {
  VERMELHO: { tone: "urgent", label: "Urgente" },
  AMARELO: { tone: "alert", label: "Alerta" },
  VERDE: { tone: "calm", label: "Tranquilo" },
} as const;

type Props = {
  feedback: PrioritySavedFeedback;
  containerRef: RefObject<HTMLDivElement | null>;
  layoutKey: string;
  onComplete: () => void;
};

/** Mount keyed by feedback.id, inside the table scroll container, after its table. */
export function QueuePriorityLed({
  feedback,
  containerRef,
  layoutKey,
  onComplete,
}: Props) {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [phase, setPhase] = useState<"snake" | "blink">("snake");
  const [bounds, setBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const { tone, label } = PRESENTATION[feedback.level];

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", changed);
    return () => preference.removeEventListener("change", changed);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const row = container?.querySelector<HTMLTableRowElement>(
      `tr[data-priority-entry="${CSS.escape(feedback.entryId)}"]`,
    );
    if (!container || !row) return;
    const update = () => {
      const rect = row.getBoundingClientRect();
      const parent = container.getBoundingClientRect();
      setBounds({
        left: rect.left - parent.left + container.scrollLeft,
        top: rect.top - parent.top + container.scrollTop,
        width: rect.width,
        height: rect.height,
      });
    };
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(row);
    observer.observe(container);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [containerRef, feedback.entryId, layoutKey]);

  useEffect(() => {
    // Timers back up animationend for background tabs/disabled browser animations.
    const timer = window.setTimeout(
      () => {
        if (reducedMotion || phase === "blink") onComplete();
        else setPhase("blink");
      },
      reducedMotion
        ? 1500
        : phase === "snake"
          ? 1450
          : tone === "calm"
            ? 500
            : 800,
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion, phase, tone, onComplete]);

  if (!bounds) return null;
  const stage = reducedMotion ? "static" : phase;
  return (
    <>
      <span className="sr-only" role="status">
        Prioridade atualizada para {label}.
      </span>
      <div
        className={`queue-led-overlay reception-priority-led led-${tone}`}
        data-entry-id={feedback.entryId}
        data-priority={feedback.level}
        data-led-phase={stage}
        style={bounds}
        aria-hidden="true"
      >
        <svg
          className="queue-led-svg"
          width="100%"
          height="100%"
          viewBox={`0 0 ${bounds.width} ${bounds.height}`}
          preserveAspectRatio="none"
        >
          {stage === "snake" ? (
            [0, 1, 2, 3].map((segment) => (
              <rect
                key={segment}
                className={`queue-led-path queue-led-snake queue-led-snake-${segment}`}
                x="2"
                y="2"
                width={Math.max(0, bounds.width - 4)}
                height={Math.max(0, bounds.height - 4)}
                rx="8"
                pathLength="100"
                strokeDasharray="6 94"
                onAnimationEnd={
                  segment === 0 ? () => setPhase("blink") : undefined
                }
              />
            ))
          ) : (
            <rect
              className={`queue-led-path queue-led-${stage}`}
              x="2"
              y="2"
              width={Math.max(0, bounds.width - 4)}
              height={Math.max(0, bounds.height - 4)}
              rx="8"
              pathLength="100"
              strokeDasharray="100"
              style={
                stage === "blink"
                  ? { animationIterationCount: tone === "calm" ? 1 : 2 }
                  : undefined
              }
              onAnimationEnd={stage === "blink" ? onComplete : undefined}
            />
          )}
        </svg>
      </div>
    </>
  );
}

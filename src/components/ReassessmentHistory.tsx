import { useEffect, useState } from "react";
import type { User } from "../auth/types";
import type { Page } from "../integrations/operational-api";
import {
  getReassessmentHistory,
  type Reassessment,
} from "../integrations/reception-reassessment";
import { priorityInfo } from "../integrations/priority-store";
import { formatDate } from "../integrations/shared-helpers";

export function ReassessmentHistory({
  entryId,
  user,
  revision,
}: {
  entryId: string;
  user: User | null;
  revision?: string;
}) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<Page<Reassessment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void getReassessmentHistory(entryId, page, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setData(result);
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Não foi possível consultar o histórico.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [entryId, page, retry, revision]);
  return (
    <section
      className="reception-history"
      aria-label="Histórico de reavaliações"
    >
      <h3>Histórico de reavaliações</h3>
      {loading ? (
        <p role="status" className="local-note">
          Consultando reavaliações…
        </p>
      ) : error ? (
        <div>
          <p role="alert" className="reception-history-error">
            {error}
          </p>
          <button
            className="local-secondary-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Tentar consultar histórico novamente
          </button>
        </div>
      ) : (
        data && (
          <>
            {!data.items.length && (
              <p className="local-note">
                Nenhuma reavaliação registrada neste atendimento.
              </p>
            )}
            <ol>
              {data.items.map((record) => (
                <li key={record.id}>
                  <div>
                    <strong>
                      {priorityInfo(record.previousSeverity)?.label} →{" "}
                      {priorityInfo(record.newSeverity)?.label}
                    </strong>
                    <time dateTime={record.occurredAt}>
                      {formatDate(record.occurredAt)}
                    </time>
                  </div>
                  <p>
                    {record.justification ||
                      record.observationSnapshot ||
                      "Justificativa não informada"}
                  </p>
                  <p className="local-note">
                    Sintomas:{" "}
                    {[
                      ...record.symptomsSnapshot.symptoms.map(
                        (symptom) => symptom.name,
                      ),
                      record.symptomsSnapshot.otherSymptoms,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                  {record.createdByUserId === user?.id ? (
                    <small>Responsável: {user.name}</small>
                  ) : (
                    <details>
                      <summary>Identificação do responsável</summary>
                      <code>{record.createdByUserId}</code>
                    </details>
                  )}
                </li>
              ))}
            </ol>
            {data.total > 0 && (
              <div className="reception-history-pagination">
                <span>
                  Página {data.page} de{" "}
                  {Math.max(1, Math.ceil(data.total / data.pageSize))} ·{" "}
                  {data.total} registro(s)
                </span>
                <button
                  className="local-secondary-button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <button
                  className="local-secondary-button"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}

import { Clock3 } from "lucide-react";
import type { Chamada } from "../types";

const PRIORITY_NAME = {
  URGENTE: "Urgente",
  ALERTA: "Alerta",
  TRANQUILO: "Tranquilo",
} as const;

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  const compoundGivenNames = ["Ana Beatriz", "Maria Clara", "João Pedro"];
  const compound = compoundGivenNames.find((givenName) => name.toLocaleLowerCase("pt-BR").startsWith(`${givenName.toLocaleLowerCase("pt-BR")} `));
  if (compound) return `${compound} ${parts.at(-1)?.[0]}.`;
  if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`;
  return parts[0] ?? name;
}

export function ProximosChamados({ chamadas }: { chamadas: Chamada[] }) {
  return (
    <section className="proximos-section" aria-labelledby="proximos-title">
      <div className="proximos-heading">
        <h2 id="proximos-title">Próximos a serem chamados</h2>
        <p>Atualização automática da fila</p>
      </div>

      <div className="proximos-grid">
        {chamadas.map((chamada) => (
          <article className="proximo-card" key={chamada.senha}>
            <div className="proximo-card-topline">
              <span className="proximo-card-label">SENHA</span>
              <span className={`proximo-priority-pill prioridade-${chamada.prioridade.toLowerCase()}`}>
                <span aria-hidden="true" /> {PRIORITY_NAME[chamada.prioridade]}
              </span>
            </div>
            <strong className="proximo-ticket">{chamada.senha}</strong>
            <p className="proximo-name" title={chamada.nome}>{shortName(chamada.nome).toLocaleUpperCase("pt-BR")}</p>
            <p className="proximo-estimate"><Clock3 size={14} aria-hidden="true" /> Previsão: ~{chamada.previsaoMinutos ?? 5} min</p>
          </article>
        ))}
        {chamadas.length === 0 && <p className="proximos-empty">Não há pacientes na fila neste momento.</p>}
      </div>
    </section>
  );
}

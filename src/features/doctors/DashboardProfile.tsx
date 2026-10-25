import { useResource } from "../clinic/hooks";
import { Link } from "react-router-dom";
import { doctorsApi } from "./api";
import { ResourceState } from "../clinic/shared";
import { clinicDate } from "../shifts/format";
export function DashboardProfile() {
  const r = useResource(doctorsApi.own);
  return (
    <section className="local-form">
      <h2>Meu consultório e escala</h2>
      <ResourceState {...r} retry={r.reload} />
      {r.data && !r.loading && !r.error && (
        <>
          <div className="operational-detail-grid">
            <div>
              <span>Especialidade</span>
              <strong>{r.data.specialty.name}</strong>
            </div>
            <div>
              <span>Sala padrão</span>
              <strong>{r.data.defaultRoom?.name || "Sem sala padrão"}</strong>
            </div>
            <div>
              <span>Plantão atual ou próximo</span>
              <strong>
                {r.data.nextShift
                  ? clinicDate(r.data.nextShift.startsAt) +
                    " — " +
                    clinicDate(r.data.nextShift.endsAt)
                  : "Nenhum plantão agendado"}
              </strong>
            </div>
            <div>
              <span>Sala do plantão</span>
              <strong>{r.data.nextShift?.room || "Sem sala definida"}</strong>
            </div>
          </div>
          <div className="local-actions">
            <Link className="local-secondary-button" to="/medico/perfil">
              Meu perfil e consultório
            </Link>
            <Link className="local-secondary-button" to="/medico/plantoes">
              Meus plantões
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

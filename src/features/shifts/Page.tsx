import { clinicDate } from "./format";
import { useResource, useSave } from "../clinic/hooks";
import { useCallback, useState, type FormEvent } from "react";
import { shiftsApi } from "./api";
import { doctorsApi } from "../doctors/api";
import { roomsApi } from "../rooms/api";
import { specialtiesApi } from "../specialties/api";
import type { Shift } from "../clinic/types";
import {
  ClinicPage,
  Confirm,
  EditorDialog,
  FormActions,
  ResourceState,
  Status,
} from "../clinic/shared";
import { validateShift } from "./validation";
const references = async (signal: AbortSignal) => {
  const [doctors, rooms, specialties] = await Promise.all([
    doctorsApi.all(signal),
    roomsApi.list(signal),
    specialtiesApi.list(signal),
  ]);
  return { doctors, rooms, specialties };
};
const days = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function localInput(value: string) {
  return new Date(Date.parse(value) - 3 * 3600000).toISOString().slice(0, 16);
}
function today() {
  return localInput(new Date().toISOString()).slice(0, 10);
}
export function ShiftsPage({ own = false }: { own?: boolean }) {
  const load = useCallback(
      (signal: AbortSignal) => shiftsApi.list(own, signal),
      [own],
    ),
    resource = useResource(load);
  const refs = useResource(
    useCallback(
      (signal: AbortSignal) =>
        own
          ? Promise.resolve({ doctors: [], rooms: [], specialties: [] })
          : references(signal),
      [own],
    ),
  );
  const [doctorFilter, setDoctorFilter] = useState(""),
    [roomFilter, setRoomFilter] = useState(""),
    [specialtyFilter, setSpecialtyFilter] = useState(""),
    [view, setView] = useState("week"),
    [week, setWeek] = useState(today());
  const [editing, setEditing] = useState<Shift | "new" | null>(null),
    [doctorId, setDoctorId] = useState(""),
    [roomId, setRoomId] = useState(""),
    [startsAt, setStartsAt] = useState(""),
    [endsAt, setEndsAt] = useState(""),
    [validation, setValidation] = useState(""),
    [confirm, setConfirm] = useState<Shift | null>(null);
  const save = useSave(() => {
    setEditing(null);
    setConfirm(null);
    resource.reload();
  });
  function edit(s: Shift | "new") {
    save.reset();
    setEditing(s);
    setValidation("");
    setDoctorId(s === "new" ? "" : s.doctorId);
    setRoomId(s === "new" ? "" : (s.roomId ?? ""));
    setStartsAt(s === "new" ? "" : localInput(s.startsAt));
    setEndsAt(s === "new" ? "" : localInput(s.endsAt));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!startsAt || !endsAt) {
      setValidation("Preencha os horários de início e fim.");
      return;
    }
    if (
      !refs.data?.rooms.some((r) => r.id === roomId && r.status === "ativa")
    ) {
      setValidation("Selecione uma sala ativa e disponível.");
      return;
    }
    const input = {
      startsAt: startsAt + ":00-03:00",
      endsAt: endsAt + ":00-03:00",
      roomId,
      availabilityStatus: "DISPONIVEL" as const,
    };
    const error = validateShift(
      input,
      doctorId,
      resource.data ?? [],
      editing && editing !== "new" ? editing.id : undefined,
      refs.data?.rooms.find((r) => r.id === roomId)?.name,
    );
    setValidation(error);
    if (error) return;
    await save.run(() =>
      shiftsApi.save(
        doctorId,
        input,
        editing && editing !== "new" ? editing.id : undefined,
      ),
    );
  }
  const list =
    resource.data?.filter(
      (s) =>
        (!doctorFilter || s.doctorId === doctorFilter) &&
        (!roomFilter || s.roomId === roomFilter) &&
        (!specialtyFilter || s.doctor?.specialtyId === specialtyFilter),
    ) ?? [];
  const monday = new Date(week + "T00:00:00-03:00");
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const dates = Array.from(
    { length: 7 },
    (_, i) => new Date(+monday + i * 86400000),
  );
  const visible =
    view === "list"
      ? list
      : list.filter((s) => {
          const day = localInput(s.startsAt).slice(0, 10);
          return dates.some((date) => date.toISOString().slice(0, 10) === day);
        });
  function entry(s: Shift) {
    return (
      <article key={s.id} className="clinic-slot">
        <time>
          {clinicDate(s.startsAt)} — {clinicDate(s.endsAt)}
        </time>
        <strong>{s.doctor?.name || "Meu plantão"}</strong>
        <span>
          {refs.data?.rooms.find((r) => r.id === s.roomId)?.name ||
            s.room ||
            "Sem sala"}
          {s.recurrenceId ? " · Semanal" : ""}
        </span>
        <Status
          active={s.availabilityStatus === "DISPONIVEL"}
          label={
            s.availabilityStatus === "DISPONIVEL" ? "Agendado" : "Cancelado"
          }
        />
        {!own && s.availabilityStatus === "DISPONIVEL" && (
          <div className="local-actions">
            <button className="local-secondary-button" onClick={() => edit(s)}>
              Editar
            </button>
            <button
              className="local-secondary-button"
              onClick={() => {
                save.reset();
                setConfirm(s);
              }}
            >
              Cancelar plantão
            </button>
          </div>
        )}
      </article>
    );
  }
  return (
    <ClinicPage title={own ? "Meus plantões" : "Plantões"} own={own}>
      <section className="local-form">
        <div className="operational-row">
          <h2>Escala de atendimento</h2>
          {!own && (
            <button
              className="local-primary"
              disabled={
                refs.loading ||
                !!refs.error ||
                resource.loading ||
                !!resource.error
              }
              onClick={() => edit("new")}
            >
              Novo plantão
            </button>
          )}
        </div>
        <div className="local-fields">
          {!own && (
            <>
              <label>
                Filtrar médico
                <select
                  value={doctorFilter}
                  onChange={(e) => setDoctorFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  {refs.data?.doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Filtrar sala
                <select
                  value={roomFilter}
                  onChange={(e) => setRoomFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  {refs.data?.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Filtrar especialidade
                <select
                  value={specialtyFilter}
                  onChange={(e) => setSpecialtyFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  {refs.data?.specialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Visualização
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="week">Semanal</option>
              <option value="list">Lista</option>
            </select>
          </label>
          {view === "week" && (
            <label>
              Semana de
              <input
                type="date"
                required
                value={week}
                onChange={(e) => {
                  if (e.target.value) setWeek(e.target.value);
                }}
              />
            </label>
          )}
        </div>
        <ResourceState {...refs} retry={refs.reload} />
        <ResourceState
          {...resource}
          retry={resource.reload}
          empty={!visible.length}
        />
        {!resource.loading &&
          !resource.error &&
          (view === "list" ? (
            list.map(entry)
          ) : (
            <div className="clinic-week">
              {dates.map((date) => {
                const day = date.toISOString().slice(0, 10),
                  entries = list.filter(
                    (s) => localInput(s.startsAt).slice(0, 10) === day,
                  );
                return (
                  <section className="clinic-day" key={day}>
                    <h3>
                      {days[date.getUTCDay()]}
                      <br />
                      {date.toLocaleDateString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                    </h3>
                    {entries.length ? (
                      entries.map(entry)
                    ) : (
                      <p className="local-note">Sem plantões</p>
                    )}
                  </section>
                );
              })}
            </div>
          ))}
      </section>
      {editing && !own && (
        <EditorDialog
          title={editing === "new" ? "Novo plantão" : "Editar ocorrência"}
          busy={save.saving}
          onClose={() => setEditing(null)}
        >
          <form className="local-form" onSubmit={(e) => void submit(e)}>
            <h2>{editing === "new" ? "Novo plantão" : "Editar ocorrência"}</h2>
            <p className="local-note">
              Horários de Brasília. A sala selecionada será reservada para este
              plantão.
            </p>
            <fieldset disabled={save.saving} className="clinic-fieldset">
              <div className="local-fields">
                <label>
                  Médico *
                  <select
                    autoFocus
                    required
                    disabled={editing !== "new"}
                    value={doctorId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setDoctorId(id);
                      const preferred = refs.data?.doctors.find(
                        (d) => d.id === id,
                      )?.defaultRoomId;
                      setRoomId(
                        refs.data?.rooms.some(
                          (r) => r.id === preferred && r.status === "ativa",
                        )
                          ? preferred!
                          : "",
                      );
                    }}
                  >
                    <option value="">Selecione</option>
                    {refs.data?.doctors
                      .filter((d) => d.active || d.id === doctorId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Sala *
                  <select
                    required
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {refs.data?.rooms
                      .filter((r) => r.status === "ativa" || r.id === roomId)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {r.status !== "ativa" ? " (indisponível)" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Data e horário de início *
                  <input
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </label>
                <label>
                  Data e horário de fim *
                  <input
                    type="datetime-local"
                    required
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </label>
              </div>
            </fieldset>
            {validation && <p role="alert">{validation}</p>}
            <FormActions {...save} onCancel={() => setEditing(null)} />
          </form>
        </EditorDialog>
      )}
      {confirm && (
        <Confirm
          title="Cancelar plantão?"
          busy={save.saving}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void save.run(() => shiftsApi.cancel(confirm))}
        >
          <p>
            {confirm.doctor?.name} · {clinicDate(confirm.startsAt)}. Esta
            ocorrência será cancelada e permanecerá no histórico.
          </p>
          {save.error && <p role="alert">{save.error}</p>}
        </Confirm>
      )}
    </ClinicPage>
  );
}

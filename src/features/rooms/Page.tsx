import { useResource, useSave } from "../clinic/hooks";
import { useState, type FormEvent } from "react";
import { roomsApi } from "./api";
import type { Room } from "../clinic/types";
import {
  ClinicPage,
  Confirm,
  EditorDialog,
  FieldError,
  FormActions,
  ResourceState,
  Status,
} from "../clinic/shared";
const labels = {
  ativa: "Ativa",
  manutencao: "Em manutenção",
  inativa: "Inativa",
};
const types = [
  "Consultório",
  "Sala de triagem",
  "Sala de observação",
  "Sala de procedimentos",
  "Sala de emergência",
];
export function RoomsPage() {
  const resource = useResource(roomsApi.list);
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const [name, setName] = useState(""),
    [type, setType] = useState("Consultório"),
    [status, setStatus] = useState<Room["status"]>("ativa");
  const [confirm, setConfirm] = useState<Room | null>(null),
    [validation, setValidation] = useState("");
  const save = useSave(() => {
    setEditing(null);
    setConfirm(null);
    resource.reload();
  });
  function edit(room: Room | "new") {
    save.reset();
    setValidation("");
    setEditing(room);
    setName(room === "new" ? "" : room.name);
    setType(room === "new" ? "Consultório" : room.type);
    setStatus(room === "new" ? "ativa" : room.status);
  }
  function persist() {
    return save.run(() =>
      roomsApi.save(
        { name: name.trim(), type: type.trim(), status },
        editing && editing !== "new" ? editing.id : undefined,
      ),
    );
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !type.trim()) {
      setValidation("Informe o nome e o tipo da sala.");
      return;
    }
    setValidation("");
    if (
      editing &&
      editing !== "new" &&
      editing.status === "ativa" &&
      status !== "ativa"
    ) {
      setConfirm(editing);
      return;
    }
    void persist();
  }
  const list = resource.data?.filter(
    (r) =>
      r.name
        .toLocaleLowerCase("pt-BR")
        .includes(q.trim().toLocaleLowerCase("pt-BR")) &&
      (!filter || r.status === filter),
  );
  return (
    <ClinicPage title="Salas e consultórios">
      <section className="local-form">
        <div className="operational-row">
          <h2>Salas cadastradas</h2>
          <button
            className="local-primary"
            disabled={resource.loading || !!resource.error}
            onClick={() => edit("new")}
          >
            Nova sala
          </button>
        </div>
        <div className="local-fields">
          <label>
            Buscar sala
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label>
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(labels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ResourceState
          {...resource}
          retry={resource.reload}
          empty={!list?.length}
        />
        {!resource.loading &&
          !resource.error &&
          list?.map((r) => (
            <article className="clinic-record" key={r.id}>
              <div>
                <strong>{r.name}</strong>
                <p>{r.type}</p>
                <Status
                  active={r.status === "ativa"}
                  label={labels[r.status]}
                />
              </div>
              <div className="local-actions">
                <button
                  className="local-secondary-button"
                  onClick={() => edit(r)}
                >
                  Editar {r.name}
                </button>
                {r.status !== "inativa" && (
                  <button
                    className="local-secondary-button"
                    onClick={() => {
                      save.reset();
                      setConfirm(r);
                    }}
                  >
                    Inativar {r.name}
                  </button>
                )}
              </div>
            </article>
          ))}
      </section>
      {editing && (
        <EditorDialog
          title={editing === "new" ? "Nova sala" : "Editar sala"}
          busy={save.saving}
          onClose={() => setEditing(null)}
        >
          <form className="local-form" onSubmit={submit}>
            <h2>{editing === "new" ? "Nova sala" : "Editar sala"}</h2>
            <fieldset className="clinic-fieldset" disabled={save.saving}>
              <div className="local-fields">
                <label>
                  Nome / número *
                  <input
                    autoFocus
                    required
                    maxLength={50}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <FieldError message={save.fields.name} />
                </label>
                <label>
                  Tipo *
                  <select
                    required
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    {!types.includes(type) && (
                      <option value={type}>{type}</option>
                    )}
                    {types.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <FieldError message={save.fields.type} />
                </label>
                <label>
                  Situação
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as Room["status"])
                    }
                  >
                    {Object.entries(labels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
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
          title="Alterar disponibilidade da sala?"
          busy={save.saving}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void (editing === confirm
              ? persist()
              : save.run(() =>
                  roomsApi.save(
                    {
                      name: confirm.name,
                      type: confirm.type,
                      status: "inativa",
                    },
                    confirm.id,
                  ),
                ))
          }
        >
          <p>
            {confirm.name}. A sala ficará indisponível para novos agendamentos.
            O histórico será preservado.
          </p>
          {save.error && <p role="alert">{save.error}</p>}
        </Confirm>
      )}
    </ClinicPage>
  );
}

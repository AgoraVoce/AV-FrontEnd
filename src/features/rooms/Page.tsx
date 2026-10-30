import { useResource, useSave } from "../clinic/hooks";
import { ApiError } from "../../integrations/client";
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
export function RoomsPage() {
  const resource = useResource(roomsApi.list),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Room | "new" | null>(null),
    [name, setName] = useState(""),
    [type, setType] = useState("Consultório"),
    [status, setStatus] = useState<Room["status"]>("ativa");
  const [confirm, setConfirm] = useState<{
      item: Room;
      remove: boolean;
    } | null>(null),
    [blocked, setBlocked] = useState(false);
  const save = useSave(() => {
    setEditing(null);
    setConfirm(null);
    resource.reload();
  });
  function edit(room: Room | "new") {
    setEditing(room);
    setName(room === "new" ? "" : room.name);
    setType(room === "new" ? "Consultório" : room.type);
    setStatus(room === "new" ? "ativa" : room.status);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      editing &&
      editing !== "new" &&
      editing.status === "ativa" &&
      status !== "ativa"
    ) {
      setBlocked(false);
      setConfirm({ item: editing, remove: false });
      return;
    }
    await save.run(() =>
      roomsApi.save(
        { name: name.trim(), type: type.trim(), status },
        editing && editing !== "new" ? editing.id : undefined,
      ),
    );
  }
  const list = resource.data?.filter(
    (r) =>
      r.name
        .toLocaleLowerCase("pt-BR")
        .includes(q.toLocaleLowerCase("pt-BR")) &&
      (!filter || r.status === filter),
  );
  return (
    <ClinicPage title="Salas e consultórios">
      <section className="local-form">
        <div className="operational-row">
          <h2>Salas cadastradas</h2>
          <button className="local-primary" disabled={Boolean(resource.error)} title={resource.error ? "Cadastro indisponível no backend" : undefined} onClick={() => edit("new")}>
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
        {resource.error && <p className="local-note" role="status">O módulo de salas requer endpoints específicos da API, ainda não implementados no back-end atual. O cadastro permanece indisponível.</p>}
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
                <p className="local-note">{r.type}</p>
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
                      setBlocked(false);
                      setConfirm({ item: r, remove: false });
                    }}
                  >
                    Inativar
                  </button>
                )}
                <button
                  className="local-secondary-button"
                  onClick={() => {
                    setBlocked(false);
                    setConfirm({ item: r, remove: true });
                  }}
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
      </section>
      {editing && (
        <EditorDialog title={editing === "new" ? "Nova sala" : "Editar sala"} busy={save.saving} onClose={() => setEditing(null)}>
        <form className="local-form" onSubmit={(e) => void submit(e)}>
          <h2>{editing === "new" ? "Nova sala" : "Editar sala"}</h2>
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
              <select required value={type} onChange={(e) => setType(e.target.value)}>
                <option value="Consultório">Consultório</option>
                <option value="Sala de triagem">Sala de triagem</option>
                <option value="Sala de observação">Sala de observação</option>
                <option value="Sala de procedimentos">Sala de procedimentos</option>
                <option value="Sala de emergência">Sala de emergência</option>
              </select>
            </label>
            <label>
              Situação
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Room["status"])}
              >
                {Object.entries(labels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <FormActions {...save} onCancel={() => setEditing(null)} />
        </form>
        </EditorDialog>
      )}
      {confirm && (
        <Confirm
          title={
            blocked
              ? "Sala vinculada"
              : confirm.remove
                ? "Excluir sala?"
                : "Alterar disponibilidade da sala?"
          }
          busy={save.saving}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void (async () => {
              const ok = await save.run(() =>
                confirm.remove && !blocked
                  ? roomsApi.remove(confirm.item.id)
                  : roomsApi.save(
                      {
                        name:
                          editing === confirm.item
                            ? name.trim()
                            : confirm.item.name,
                        type:
                          editing === confirm.item
                            ? type.trim()
                            : confirm.item.type,
                        status: editing === confirm.item ? status : "inativa",
                      },
                      confirm.item.id,
                    ),
              );
              if (
                !ok &&
                confirm.remove &&
                save.lastError.current instanceof ApiError &&
                save.lastError.current.code === "ROOM_IN_USE"
              )
                setBlocked(true);
            })()
          }
        >
          <p>
            {confirm.item.name}.{" "}
            {blocked
              ? "Não foi possível remover a sala. Se houver vínculo com médicos ou plantões, confirme para inativá-la."
              : "Confirme para continuar."}
          </p>
          {save.error && <p role="alert">{save.error}</p>}
        </Confirm>
      )}
    </ClinicPage>
  );
}

import { useResource, useSave } from "../clinic/hooks";
import { useState, type FormEvent } from "react";
import { specialtiesApi } from "./api";
import type { Specialty } from "../clinic/types";
import {
  ClinicPage,
  Confirm,
  EditorDialog,
  FieldError,
  FormActions,
  ResourceState,
  Status,
} from "../clinic/shared";
export function SpecialtiesPage() {
  const resource = useResource(specialtiesApi.list),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Specialty | "new" | null>(null),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [active, setActive] = useState(true);
  const [confirm, setConfirm] = useState<{
    item: Specialty;
    remove: boolean;
  } | null>(null);
  const save = useSave(() => {
    setEditing(null);
    setConfirm(null);
    resource.reload();
  });
  function edit(item: Specialty | "new") {
    setEditing(item);
    setName(item === "new" ? "" : item.name);
    setDescription(item === "new" ? "" : (item.description ?? ""));
    setActive(item === "new" || item.active);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (editing && editing !== "new" && editing.active && !active) {
      setConfirm({ item: editing, remove: false });
      return;
    }
    await save.run(() =>
      specialtiesApi.save(
        { name: name.trim(), description: description.trim() || null, active },
        editing && editing !== "new" ? editing.id : undefined,
      ),
    );
  }
  const list = resource.data?.filter(
    (s) =>
      s.name
        .toLocaleLowerCase("pt-BR")
        .includes(q.toLocaleLowerCase("pt-BR")) &&
      (!status || String(s.active) === status),
  );
  return (
    <ClinicPage title="Especialidades">
      <section className="local-form">
        <div className="operational-row">
          <h2>Especialidades cadastradas</h2>
          <button className="local-primary" onClick={() => edit("new")}>
            Nova especialidade
          </button>
        </div>
        <div className="local-fields">
          <label>
            Buscar especialidade
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="true">Ativa</option>
              <option value="false">Inativa</option>
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
          list?.map((s) => (
            <article className="clinic-record" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <p className="local-note">
                  {s.description || "Sem descrição"} · {s.doctorCount} médico(s)
                </p>
                <Status
                  active={s.active}
                  label={s.active ? "Ativa" : "Inativa"}
                />
              </div>
              <div className="local-actions">
                <button
                  className="local-secondary-button"
                  onClick={() => edit(s)}
                >
                  Editar {s.name}
                </button>
                {s.active && (
                  <button
                    className="local-secondary-button"
                    onClick={() => setConfirm({ item: s, remove: false })}
                  >
                    Inativar
                  </button>
                )}
                <button
                  className="local-secondary-button"
                  onClick={() =>
                    setConfirm({ item: s, remove: s.doctorCount === 0 })
                  }
                >
                  {s.doctorCount ? "Especialidade vinculada" : "Excluir"}
                </button>
              </div>
            </article>
          ))}
      </section>
      {editing && (
        <EditorDialog
          title={editing === "new" ? "Nova especialidade" : "Editar especialidade"}
          busy={save.saving}
          onClose={() => setEditing(null)}
        >
        <form className="local-form" onSubmit={(e) => void submit(e)}>
          <h2>
            {editing === "new" ? "Nova especialidade" : "Editar especialidade"}
          </h2>
          <fieldset disabled={save.saving} className="clinic-fieldset">
            <div className="local-fields">
              <label>
                Nome *
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <FieldError message={save.fields.name} />
              </label>
              <label>
                Situação
                <select
                  value={String(active)}
                  onChange={(e) => setActive(e.target.value === "true")}
                >
                  <option value="true">Ativa</option>
                  <option value="false">Inativa</option>
                </select>
              </label>
              <label className="local-wide">
                Descrição
                <textarea
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>
          </fieldset>
          <FormActions {...save} onCancel={() => setEditing(null)} />
        </form>
        </EditorDialog>
      )}
      {confirm && (
        <Confirm
          title={
            confirm.remove
              ? "Excluir especialidade?"
              : "Inativar especialidade?"
          }
          busy={save.saving}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void save.run(() =>
              confirm.remove
                ? specialtiesApi.remove(confirm.item.id)
                : specialtiesApi.save(
                    {
                      name:
                        editing === confirm.item
                          ? name.trim()
                          : confirm.item.name,
                      description:
                        editing === confirm.item
                          ? description.trim() || null
                          : confirm.item.description,
                      active: false,
                    },
                    confirm.item.id,
                  ),
            )
          }
        >
          <p>
            {confirm.item.doctorCount > 0
              ? "Esta especialidade possui médicos vinculados e não pode ser excluída. Você pode inativá-la."
              : confirm.item.name}
          </p>
          <p>Confirme para continuar.</p>
          {save.error && <p role="alert">{save.error}</p>}
        </Confirm>
      )}
    </ClinicPage>
  );
}

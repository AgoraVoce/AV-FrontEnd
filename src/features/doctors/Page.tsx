import { useResource, useSave } from "../clinic/hooks";
import { useCallback, useState, type FormEvent } from "react";
import { doctorsApi } from "./api";
import { specialtiesApi } from "../specialties/api";
import { roomsApi } from "../rooms/api";
import type { Professional, ProfessionalInput } from "../clinic/types";
import {
  ClinicPage,
  Confirm,
  EditorDialog,
  FieldError,
  FormActions,
  ResourceState,
  Status,
} from "../clinic/shared";
import { useSearchParams } from "react-router-dom";
import { LinkDoctorDialog } from "./LinkDoctorDialog";
import { UFS, validateDoctor } from "./validation";
const blank: ProfessionalInput = {
  name: "",
  email: "",
  crmNumber: "",
  crmUf: "SP",
  phone: null,
  specialtyId: "",
  defaultRoomId: null,
  active: true,
  password: "",
};
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const options = async (signal: AbortSignal) => {
  const [specialties, rooms] = await Promise.all([
    specialtiesApi.list(signal),
    roomsApi.list(signal),
  ]);
  return { specialties, rooms };
};
export function DoctorsPage() {
  const [params] = useSearchParams();
  const [linking, setLinking] = useState(false);
  const [q, setQ] = useState(""),
    [specialty, setSpecialty] = useState(""),
    [active, setActive] = useState(""),
    [page, setPage] = useState(1);
  const load = useCallback(
    (signal: AbortSignal) =>
      doctorsApi.list(q.trim(), specialty, active, page, signal),
    [q, specialty, active, page],
  );
  const resource = useResource(load),
    references = useResource(options);
  const [editing, setEditing] = useState<Professional | "new" | null>(
      params.get("novo") === "1" ? "new" : null,
    ),
    [input, setInput] = useState<ProfessionalInput>(blank),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [confirm, setConfirm] = useState<Professional | null>(null);
  const save = useSave(() => {
    setEditing(null);
    setConfirm(null);
    resource.reload();
  });
  function edit(d: Professional | "new") {
    save.reset();
    setEditing(d);
    setErrors({});
    setInput(
      d === "new"
        ? { ...blank }
        : {
            name: d.name,
            email: d.user.email,
            crmNumber: d.crmNumber ?? "",
            crmUf: d.crmUf ?? "SP",
            phone: d.phone,
            specialtyId: d.specialtyId,
            defaultRoomId: d.defaultRoomId,
            active: d.active,
          },
    );
  }
  const change = <K extends keyof ProfessionalInput>(
    key: K,
    value: ProfessionalInput[K],
  ) => setInput((p) => ({ ...p, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = {
        ...input,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
      },
      fields = validateDoctor(clean);
    if (editing && editing !== "new" && editing.phone && !clean.phone)
      fields.phone =
        "Informe o telefone. O telefone cadastrado não pode ser removido.";
    setErrors(fields);
    if (Object.keys(fields).length) return;
    if (editing && editing !== "new" && editing.active && !input.active) {
      setConfirm(editing);
      return;
    }
    await save.run(() =>
      doctorsApi.save(
        clean,
        editing && editing !== "new" ? editing.id : undefined,
        editing && editing !== "new" ? editing : undefined,
      ),
    );
  }
  const error = (key: string) => (
    <FieldError message={errors[key] || save.fields[key]} />
  );
  return (
    <ClinicPage title="Médicos">
      <section className="local-form">
        <div className="operational-row">
          <h2>Equipe médica</h2>
          <div className="local-actions">
            <button
              className="local-secondary-button"
              onClick={() => setLinking(true)}
            >
              Vincular conta existente
            </button>
            <button
              className="local-primary"
              disabled={references.loading || !!references.error}
              onClick={() => edit("new")}
            >
              Novo médico
            </button>
          </div>
        </div>
        <div className="local-fields">
          <label>
            Buscar por nome ou CRM
            <input
              type="search"
              maxLength={150}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Especialidade
            <select
              value={specialty}
              onChange={(e) => {
                setSpecialty(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {references.data?.specialties.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={active}
              onChange={(e) => {
                setActive(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </label>
        </div>
        <ResourceState
          loading={references.loading}
          error={references.error}
          retry={references.reload}
        />
        <ResourceState
          {...resource}
          retry={resource.reload}
          empty={!resource.data?.items.length}
        />
        {!resource.loading &&
          !resource.error &&
          resource.data?.items.map((d) => (
            <article className="clinic-record" key={d.id}>
              <div className="admin-section-identity">
                <span className="admin-section-avatar" aria-hidden="true">
                  {initials(d.name)}
                </span>
                <div>
                  <strong>{d.name}</strong>
                  <small>
                    CRM/{d.crmUf || "—"} {d.crmNumber || "Não cadastrado"}
                  </small>
                  <p className="local-note">
                    {d.specialty.name} ·{" "}
                    {d.defaultRoom?.name || "Sem sala padrão"}
                  </p>
                  <p className="local-note">{d.user.email}</p>
                  <Status active={d.active} />
                </div>
              </div>
              <div className="local-actions">
                <button
                  className="local-secondary-button"
                  onClick={() => edit(d)}
                >
                  Editar {d.name}
                </button>
                {!d.active && <button className="local-secondary-button" disabled={save.saving} onClick={() => { save.reset(); void save.run(() => doctorsApi.reactivate(d.id)); }}>Reativar {d.name}</button>}
                {d.active && (
                  <button
                    className="local-secondary-button"
                    onClick={() => {
                      save.reset();
                      setConfirm(d);
                    }}
                  >
                    Inativar
                  </button>
                )}
              </div>
            </article>
          ))}
        {resource.data && (
          <div className="operational-pagination">
            <span>
              {resource.data.total} médico(s) · Página {page}
            </span>
            <div className="local-actions">
              <button
                className="local-secondary-button"
                disabled={page === 1 || resource.loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <button
                className="local-secondary-button"
                disabled={page * 10 >= resource.data.total || resource.loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </section>
      {linking && (
        <LinkDoctorDialog
          onClose={() => setLinking(false)}
          onSaved={() => {
            setLinking(false);
            resource.reload();
          }}
        />
      )}
      {editing && (
        <EditorDialog
          title={editing === "new" ? "Novo médico" : "Editar médico"}
          busy={save.saving}
          onClose={() => setEditing(null)}
        >
          <form className="local-form" onSubmit={(e) => void submit(e)}>
            <h2>{editing === "new" ? "Novo médico" : "Editar médico"}</h2>
            <p className="local-note">
              Campos obrigatórios marcados com *. O cadastro cria a conta de
              acesso e o perfil médico na mesma operação.
            </p>
            <fieldset className="clinic-fieldset" disabled={save.saving}>
              <div className="local-fields">
                <label>
                  Nome completo *
                  <input
                    autoFocus
                    required
                    minLength={2}
                    maxLength={150}
                    value={input.name}
                    onChange={(e) => change("name", e.target.value)}
                  />
                  {error("name")}
                </label>
                <label>
                  E-mail *
                  <input
                    required
                    type="email"
                    maxLength={150}
                    value={input.email}
                    onChange={(e) => change("email", e.target.value)}
                  />
                  {error("email")}
                </label>
                <label>
                  CRM (número) *
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{1,10}"
                    maxLength={10}
                    value={input.crmNumber}
                    onChange={(e) => change("crmNumber", e.target.value)}
                  />
                  {error("crmNumber")}
                </label>
                <label>
                  UF do CRM *
                  <select
                    value={input.crmUf}
                    onChange={(e) => change("crmUf", e.target.value)}
                  >
                    {UFS.map((uf) => (
                      <option key={uf}>{uf}</option>
                    ))}
                  </select>
                  {error("crmUf")}
                </label>
                <label>
                  Telefone{editing === "new" ? " *" : ""}
                  <input
                    type="tel"
                    required={editing === "new"}
                    maxLength={11}
                    placeholder="DDD e número"
                    value={input.phone ?? ""}
                    onChange={(e) =>
                      change("phone", e.target.value.replace(/\D/g, "") || null)
                    }
                  />
                  {error("phone")}
                </label>
                <label>
                  Especialidade principal *
                  <select
                    required
                    value={input.specialtyId}
                    onChange={(e) => change("specialtyId", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {references.data?.specialties
                      .filter((s) => s.active || s.id === input.specialtyId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {!s.active ? " (inativa)" : ""}
                        </option>
                      ))}
                  </select>
                  {error("specialtyId")}
                </label>
                <label>
                  Sala padrão
                  <select
                    value={input.defaultRoomId ?? ""}
                    onChange={(e) =>
                      change("defaultRoomId", e.target.value || null)
                    }
                  >
                    <option value="">Sem sala padrão</option>
                    {references.data?.rooms
                      .filter(
                        (r) =>
                          r.status === "ativa" || r.id === input.defaultRoomId,
                      )
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {r.status !== "ativa" ? " (indisponível)" : ""}
                        </option>
                      ))}
                  </select>
                  {error("defaultRoomId")}
                </label>
                <label>
                  Situação
                  <select
                    value={String(input.active)}
                    onChange={(e) =>
                      change("active", e.target.value === "true")
                    }
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </label>
                {editing === "new" && (
                  <label>
                    Senha inicial *
                    <input
                      required
                      minLength={8}
                      maxLength={1024}
                      type="password"
                      autoComplete="new-password"
                      value={input.password}
                      onChange={(e) => change("password", e.target.value)}
                    />
                    {error("password")}
                  </label>
                )}
              </div>
            </fieldset>
            <FormActions
              {...save}
              onCancel={() => {
                setInput(blank);
                setEditing(null);
              }}
            />
          </form>
        </EditorDialog>
      )}
      {confirm && (
        <Confirm
          title="Inativar médico?"
          busy={save.saving}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void save.run(() =>
              editing === confirm
                ? doctorsApi.save(
                    {
                      ...input,
                      name: input.name.trim(),
                      email: input.email.trim().toLowerCase(),
                      active: false,
                    },
                    confirm.id,
                    confirm,
                  )
                : doctorsApi.deactivate(confirm.id),
            )
          }
        >
          <p>
            {confirm.name} será inativado. O histórico será preservado. Entradas
            abertas precisam ser reatribuídas ou finalizadas antes.
          </p>
          {save.error && <p role="alert">{save.error}</p>}
        </Confirm>
      )}
    </ClinicPage>
  );
}
export function OwnProfilePage() {
  const resource = useResource(doctorsApi.own);
  return (
    <ClinicPage title="Meu perfil e consultório" own>
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data && !resource.loading && !resource.error && (
        <section className="local-form">
          <h2>{resource.data.name}</h2>
          <div className="operational-detail-grid">
            <div>
              <span>CRM</span>
              <strong>
                {resource.data.crmNumber
                  ? `${resource.data.crmNumber}/${resource.data.crmUf}`
                  : "Não cadastrado"}
              </strong>
            </div>
            <div>
              <span>Especialidade</span>
              <strong>{resource.data.specialty.name}</strong>
            </div>
            <div>
              <span>Sala padrão</span>
              <strong>
                {resource.data.defaultRoom?.name || "Sem sala padrão"}
              </strong>
            </div>
            <div>
              <span>E-mail</span>
              <strong>{resource.data.user.email}</strong>
            </div>
            <div>
              <span>Telefone</span>
              <strong>{resource.data.phone || "Não cadastrado"}</strong>
            </div>
          </div>
          <p className="local-note">
            Para alterar seus dados, entre em contato com a administração.
          </p>
        </section>
      )}
    </ClinicPage>
  );
}

import { useState, type FormEvent } from "react";
import { doctorsApi } from "./api";
import { specialtiesApi } from "../specialties/api";
import { useResource, useSave } from "../clinic/hooks";
import {
  EditorDialog,
  FieldError,
  FormActions,
  ResourceState,
} from "../clinic/shared";
export function LinkDoctorDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const accounts = useResource(doctorsApi.unlinked),
    specialties = useResource(specialtiesApi.list);
  const [userId, setUserId] = useState(""),
    [specialtyId, setSpecialtyId] = useState("");
  const save = useSave(onSaved);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !userId ||
      !specialtyId ||
      accounts.loading ||
      specialties.loading ||
      accounts.error ||
      specialties.error
    )
      return;
    await save.run(() => doctorsApi.link(userId, specialtyId));
  }
  return (
    <EditorDialog
      title="Vincular conta existente"
      busy={save.saving}
      onClose={onClose}
    >
      <form className="local-form" onSubmit={(event) => void submit(event)}>
        <h2>Completar cadastro médico</h2>
        <p>
          Vincule uma conta médica existente ao perfil clínico, sem criar outro
          login ou alterar a senha.
        </p>
        <p className="local-note">
          Se o médico já aparece na listagem como inativo, reative o cadastro
          existente em Editar.
        </p>
        <ResourceState {...accounts} retry={accounts.reload} />
        {!accounts.loading && !accounts.error && !accounts.data?.length && (
          <p role="status">
            Nenhuma conta médica ativa sem vínculo foi encontrada.
          </p>
        )}
        <ResourceState {...specialties} retry={specialties.reload} />
        <fieldset
          className="clinic-fieldset"
          disabled={
            save.saving ||
            accounts.loading ||
            specialties.loading ||
            !!accounts.error ||
            !!specialties.error
          }
        >
          <label>
            Conta médica existente *
            <select
              required
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              <option value="">Selecione a conta</option>
              {accounts.data?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.email}
                </option>
              ))}
            </select>
            <FieldError message={save.fields.userId} />
          </label>
          <label>
            Especialidade *
            <select
              required
              value={specialtyId}
              onChange={(event) => setSpecialtyId(event.target.value)}
            >
              <option value="">Selecione</option>
              {specialties.data
                ?.filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <FieldError message={save.fields.specialtyId} />
          </label>
        </fieldset>
        <FormActions {...save} onCancel={onClose} />
      </form>
    </EditorDialog>
  );
}

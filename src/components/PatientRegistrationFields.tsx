import {
  clinicDate,
  type PatientRegistration,
  type PatientRegistrationErrors,
} from "../integrations/patient-registration";

const FIELDS = [
  {
    key: "fullName",
    label: "Nome completo *",
    type: "text",
    maxLength: 150,
    autoComplete: "name",
  },
  {
    key: "cpf",
    label: "CPF *",
    type: "text",
    maxLength: 14,
    autoComplete: "off",
  },
  {
    key: "birthDate",
    label: "Data de nascimento",
    type: "date",
    autoComplete: "bday",
  },
  {
    key: "phone",
    label: "Telefone",
    type: "tel",
    maxLength: 20,
    autoComplete: "tel",
  },
  {
    key: "email",
    label: "E-mail",
    type: "email",
    maxLength: 255,
    autoComplete: "email",
  },
] as const;
export function PatientRegistrationFields({
  patient,
  errors,
  busy,
  onChange,
}: {
  patient: PatientRegistration;
  errors: PatientRegistrationErrors;
  busy: boolean;
  onChange: (field: keyof PatientRegistration, value: string) => void;
}) {
  return (
    <div className="local-fields patient-registration-fields">
      {FIELDS.map((field) => {
        const error = errors[field.key];
        return (
          <label
            className={field.key === "email" ? "local-wide" : undefined}
            key={field.key}
          >
            <span id={`patient-${field.key}-label`}>{field.label}</span>
            <input
              id={`patient-${field.key}`}
              name={field.key}
              type={field.type}
              value={patient[field.key]}
              disabled={busy}
              autoFocus={field.key === "fullName"}
              autoComplete={field.autoComplete}
              maxLength={"maxLength" in field ? field.maxLength : undefined}
              required={field.key === "fullName" || field.key === "cpf"}
              inputMode={field.key === "cpf" ? "numeric" : undefined}
              placeholder={field.key === "cpf" ? "000.000.000-00" : undefined}
              min={field.key === "birthDate" ? "0001-01-01" : undefined}
              max={field.key === "birthDate" ? clinicDate() : undefined}
              aria-labelledby={`patient-${field.key}-label`}
              aria-invalid={Boolean(error)}
              aria-describedby={
                error
                  ? `patient-${field.key}-error`
                  : field.key === "cpf"
                    ? "patient-cpf-help"
                    : undefined
              }
              onChange={(event) => onChange(field.key, event.target.value)}
            />
            {error ? (
              <small
                id={`patient-${field.key}-error`}
                className="patient-registration-error"
                role="alert"
              >
                {error}
              </small>
            ) : (
              field.key === "cpf" && (
                <small
                  id="patient-cpf-help"
                  className="patient-registration-help"
                >
                  Informe um CPF válido, com ou sem pontuação.
                </small>
              )
            )}
          </label>
        );
      })}
    </div>
  );
}

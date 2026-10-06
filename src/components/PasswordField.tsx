import type { Ref } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  revealed,
  onToggle,
  disabled,
  error,
  invalid = false,
  descriptionId,
  help,
  inputRef,
  autoComplete = "new-password",
  minLength,
  maxLength = 1024,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  revealed: boolean;
  onToggle: () => void;
  disabled: boolean;
  error?: string;
  invalid?: boolean;
  descriptionId?: string;
  help?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoComplete?: "current-password" | "new-password";
  minLength?: number;
  maxLength?: number;
}) {
  const subject =
    autoComplete === "current-password"
      ? "senha"
      : label === "Confirmar nova senha"
        ? "confirmação de senha"
        : label.toLowerCase();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-wrap">
        <input
          id={id}
          name={id}
          ref={inputRef}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={
            autoComplete === "current-password" ? maxLength : undefined
          }
          value={value}
          disabled={disabled}
          placeholder={label === "Senha" ? "Sua senha de acesso" : label}
          aria-invalid={Boolean(error) || invalid}
          aria-describedby={[`${id}-error`, descriptionId]
            .filter(Boolean)
            .join(" ")}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={`${revealed ? "Ocultar" : "Mostrar"} ${subject}`}
          aria-pressed={revealed}
          disabled={disabled}
          onClick={onToggle}
        >
          {revealed ? (
            <EyeOff size={22} aria-hidden="true" />
          ) : (
            <Eye size={22} aria-hidden="true" />
          )}
        </button>
      </div>
      <p
        className={`field-help${error ? " field-error" : ""}`}
        id={`${id}-error`}
      >
        {error || help || "\u00a0"}
      </p>
    </div>
  );
}

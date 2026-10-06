import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  LockKeyhole,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { PasswordField } from "../components/PasswordField";
import { Feedback, Spinner } from "../components/Feedback";
import { usePageTitle } from "../components/usePageTitle";
import { useAuth } from "./context";
import { recoveryApi, RecoveryError, RECOVERY_COPY } from "./recovery-api";
import type { RecoveryChallenge, ResetGrant } from "./recovery-api";

type Step = "email" | "code" | "password" | "success";
type Operation = "request" | "resend" | "verify" | "reset";
const LABELS = {
  email: [
    "Vamos recuperar seu acesso.",
    "Digite o e-mail da sua conta para receber um código.",
  ],
  code: [
    "Confira seu e-mail.",
    "Se esse e-mail estiver cadastrado, você receberá um código. Confira também a pasta de spam.",
  ],
  password: [
    "Crie uma nova senha.",
    "Tudo certo com o código. Agora escolha uma nova senha.",
  ],
  success: [
    "Senha redefinida.",
    "Sua nova senha está pronta. Agora você pode entrar.",
  ],
} as const;
const PRESENTATION = {
  headline: ["Volte para", "a sua"],
  accent: "conta.",
  description: "Receba um código por e-mail e escolha uma nova senha.",
  loginHelp: "",
};
const STEPS = ["E-mail", "Código", "Nova senha"];
function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function RecoveryPage() {
  const { invalidateSession } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);
  const [revealConfirmation, setRevealConfirmation] = useState(false);
  const [challenge, setChallenge] = useState<
    (RecoveryChallenge & { expiresAt: number; resendAt: number }) | null
  >(null);
  const [grant, setGrant] = useState<
    (ResetGrant & { expiresAt: number }) | null
  >(null);
  const [errors, setErrors] = useState({
    email: "",
    code: "",
    password: "",
    confirmation: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<Operation | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterRequest = useRef<HTMLInputElement | null>(null);
  usePageTitle(LABELS[step][0]);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!busy && focusAfterRequest.current) {
      focusAfterRequest.current.focus();
      focusAfterRequest.current = null;
    }
  }, [busy]);
  useEffect(() => {
    if (step !== "code" && step !== "password") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  const remaining = challenge
    ? Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000))
    : 0;
  const resendWait = challenge
    ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000))
    : 0;
  const codeExpired = step === "code" && remaining === 0;
  const grantExpired =
    step === "password" && (!grant || now >= grant.expiresAt);
  const stepIndex = step === "email" ? 0 : step === "code" ? 1 : 2;
  function clearSecrets() {
    setCode("");
    setPassword("");
    setConfirmation("");
    setGrant(null);
    setRevealPassword(false);
    setRevealConfirmation(false);
  }
  function restart() {
    if (lock.current) return;
    clearSecrets();
    setChallenge(null);
    setError(null);
    setNotice("");
    setErrors({ email: "", code: "", password: "", confirmation: "" });
    setStep("email");
  }
  async function run(
    operation: Operation,
    action: (signal: AbortSignal) => Promise<void>,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(operation);
    setError(null);
    setNotice("");
    const request = new AbortController();
    controller.current = request;
    try {
      await action(request.signal);
    } catch (cause) {
      if (!request.signal.aborted) {
        const kind =
          cause instanceof RecoveryError ? cause.kind : "unavailable";
        setError(
          operation === "reset" && kind === "unavailable"
            ? "Não conseguimos confirmar se a senha mudou. Tente de novo ou tente entrar com a nova senha."
            : RECOVERY_COPY[kind],
        );
        if (operation === "verify") focusAfterRequest.current = codeRef.current;
        if (operation === "reset" && kind === "policy")
          focusAfterRequest.current = passwordRef.current;
        if (operation === "reset" && kind === "expired") {
          clearSecrets();
        }
      }
    } finally {
      if (!request.signal.aborted) {
        lock.current = false;
        setBusy(null);
      }
    }
  }
  async function issueCode(operation: "request" | "resend") {
    if (
      lock.current ||
      (operation === "resend" && challenge && Date.now() < challenge.resendAt)
    )
      return;
    const invalid = !email.trim()
      ? "Digite seu e-mail."
      : emailRef.current?.validity.typeMismatch
        ? "Confira se o e-mail está escrito corretamente."
        : "";
    if (invalid) {
      setErrors((old) => ({ ...old, email: invalid }));
      emailRef.current?.focus();
      return;
    }
    await run(operation, async (signal) => {
      const next = await recoveryApi.request(email.trim(), signal);
      if (signal.aborted) return;
      const issued = Date.now();
      setNow(issued);
      clearSecrets();
      setChallenge({
        ...next,
        expiresAt: issued + next.expiresInSeconds * 1000,
        resendAt: issued + next.resendAfterSeconds * 1000,
      });
      setErrors((old) => ({
        ...old,
        code: "",
        password: "",
        confirmation: "",
      }));
      setStep("code");
      if (operation === "resend") {
        setNotice(
          "Se esse e-mail estiver cadastrado, você receberá outro código. Use o mais recente.",
        );
        focusAfterRequest.current = codeRef.current;
      }
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (step === "email") {
      await issueCode("request");
      return;
    }
    if (step === "code" && challenge) {
      if (Date.now() >= challenge.expiresAt) {
        setError(RECOVERY_COPY.code);
        return;
      }
      const invalid = !new RegExp(`^\\d{${challenge.codeLength}}$`).test(code);
      if (invalid) {
        setErrors((old) => ({
          ...old,
          code: `Digite os ${challenge.codeLength} dígitos do código.`,
        }));
        codeRef.current?.focus();
        return;
      }
      await run("verify", async (signal) => {
        const next = await recoveryApi.verify(
          challenge.challengeId,
          code,
          signal,
        );
        if (signal.aborted) return;
        const issued = Date.now();
        setNow(issued);
        setCode("");
        setGrant({ ...next, expiresAt: issued + next.expiresInSeconds * 1000 });
        setStep("password");
      });
      return;
    }
    if (step === "password" && challenge) {
      if (!grant || Date.now() >= grant.expiresAt) {
        clearSecrets();
        setError(RECOVERY_COPY.expired);
        return;
      }
      const length = Array.from(password).length;
      const next = {
        password: !password
          ? "Digite sua nova senha."
          : length < challenge.passwordPolicy.minLength ||
              length > challenge.passwordPolicy.maxLength
            ? `Use de ${challenge.passwordPolicy.minLength} a ${challenge.passwordPolicy.maxLength} caracteres.`
            : "",
        confirmation: !confirmation
          ? "Digite a nova senha mais uma vez."
          : password !== confirmation
            ? "Digite a mesma senha nos dois campos."
            : "",
      };
      setErrors((old) => ({ ...old, ...next }));
      if (next.password || next.confirmation) {
        (next.password ? passwordRef : confirmationRef).current?.focus();
        return;
      }
      await run("reset", async (signal) => {
        await recoveryApi.reset(grant.resetToken, password, signal);
        if (signal.aborted) return;
        invalidateSession();
        clearSecrets();
        setChallenge(null);
        setEmail("");
        setStep("success");
      });
    }
  }
  return (
    <AuthLayout titleId="recovery-title" presentation={PRESENTATION}>
      <Link className="back-link" to="/login">
        <ArrowLeft size={17} aria-hidden="true" />
        Voltar para o login
      </Link>
      <ol className="recovery-steps" aria-label="Etapas da recuperação">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={
              step !== "success" && index === stepIndex ? "step" : undefined
            }
            className={
              index < stepIndex || step === "success"
                ? "is-complete"
                : index === stepIndex
                  ? "is-current"
                  : ""
            }
          >
            <span className="step-marker" aria-hidden="true">
              {index < stepIndex || step === "success" ? (
                <Check size={14} />
              ) : (
                index + 1
              )}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <header className="form-heading recovery-heading">
        <p className="eyebrow">Esqueceu a senha?</p>
        <h1 id="recovery-title" ref={headingRef} tabIndex={-1}>
          {LABELS[step][0]}
        </h1>
        <p>{LABELS[step][1]}</p>
      </header>
      {step === "success" ? (
        <div className="recovery-success">
          <CircleCheck size={42} aria-hidden="true" />
          <p role="status">Tudo pronto. Sua nova senha já pode ser usada.</p>
          <Link className="primary-button" to="/login">
            Voltar para entrar
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
          aria-busy={Boolean(busy)}
        >
          {step === "email" && (
            <div className="field">
              <label htmlFor="recovery-email">E-mail</label>
              <input
                id="recovery-email"
                name="email"
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                placeholder="voce@clinica.com.br"
                value={email}
                disabled={Boolean(busy)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby="recovery-email-help"
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrors((old) => ({ ...old, email: "" }));
                }}
              />
              <p
                id="recovery-email-help"
                className={`field-help${errors.email ? " field-error" : ""}`}
              >
                {errors.email || "Use o e-mail da sua conta."}
              </p>
            </div>
          )}
          {step === "code" && challenge && (
            <>
              <div className="recovery-recipient">
                <span>E-mail informado</span>
                <strong>{email.trim()}</strong>
                <button
                  className="text-button"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={restart}
                >
                  Alterar e-mail
                </button>
              </div>
              <div className="field">
                <label htmlFor="recovery-code">Código de verificação</label>
                <input
                  className="code-input"
                  id="recovery-code"
                  ref={codeRef}
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={challenge.codeLength}
                  pattern={`[0-9]{${challenge.codeLength}}`}
                  value={code}
                  disabled={Boolean(busy)}
                  placeholder={"0".repeat(challenge.codeLength)}
                  aria-invalid={Boolean(errors.code)}
                  aria-describedby="recovery-code-help"
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\s/g, ""));
                    setErrors((old) => ({ ...old, code: "" }));
                  }}
                  onPaste={(event) => {
                    const pasted = event.clipboardData
                      .getData("text")
                      .replace(/\s/g, "");
                    if (
                      /^\d+$/.test(pasted) &&
                      pasted.length <= challenge.codeLength
                    ) {
                      event.preventDefault();
                      setCode(pasted);
                      setErrors((old) => ({ ...old, code: "" }));
                    }
                  }}
                />
                <p
                  className={`field-help${errors.code || codeExpired ? " field-error" : ""}`}
                  id="recovery-code-help"
                >
                  {errors.code ||
                    (codeExpired
                      ? "O código expirou. Peça um novo abaixo."
                      : `Digite os ${challenge.codeLength} dígitos. Expira em ${formatTime(remaining)}.`)}
                </p>
              </div>
            </>
          )}
          {step === "password" && challenge && (
            <>
              <PasswordField
                id="new-password"
                label="Nova senha"
                value={password}
                inputRef={passwordRef}
                revealed={revealPassword}
                onToggle={() => setRevealPassword((value) => !value)}
                disabled={Boolean(busy)}
                error={errors.password}
                help={`Use de ${challenge.passwordPolicy.minLength} a ${challenge.passwordPolicy.maxLength} caracteres. Você pode usar uma frase.`}
                onChange={(value) => {
                  setPassword(value);
                  setErrors((old) => ({ ...old, password: "" }));
                }}
              />
              <PasswordField
                id="confirm-password"
                label="Confirmar nova senha"
                value={confirmation}
                inputRef={confirmationRef}
                revealed={revealConfirmation}
                onToggle={() => setRevealConfirmation((value) => !value)}
                disabled={Boolean(busy)}
                error={errors.confirmation}
                onChange={(value) => {
                  setConfirmation(value);
                  setErrors((old) => ({ ...old, confirmation: "" }));
                }}
              />
            </>
          )}
          <div className="form-feedback">
            {error && <Feedback message={error} />}
            {grantExpired && !error && (
              <Feedback message={RECOVERY_COPY.expired} />
            )}
            {notice && (
              <p className="recovery-notice" role="status">
                {notice}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="primary-button"
            disabled={Boolean(busy) || codeExpired || grantExpired}
          >
            <span>
              {busy === "request"
                ? "Enviando código…"
                : busy === "verify"
                  ? "Verificando código…"
                  : busy === "reset"
                    ? "Salvando senha…"
                    : step === "email"
                      ? "Enviar código"
                      : step === "code"
                        ? "Verificar código"
                        : "Redefinir senha"}
            </span>
            {busy ? <Spinner /> : <ArrowRight size={20} aria-hidden="true" />}
          </button>
          {step === "code" && (
            <div className="resend-row">
              <span>Não recebeu o código?</span>
              <button
                type="button"
                className="text-button"
                disabled={Boolean(busy) || resendWait > 0}
                onClick={() => {
                  void issueCode("resend");
                }}
              >
                {busy === "resend"
                  ? "Reenviando código…"
                  : resendWait > 0
                    ? `Reenviar em ${resendWait}s`
                    : "Reenviar código"}
              </button>
            </div>
          )}
          {step === "password" && (
            <button
              type="button"
              className="text-button recovery-restart"
              disabled={Boolean(busy)}
              onClick={restart}
            >
              Recomeçar recuperação
            </button>
          )}
          <p className="sr-only" role="status">
            {busy ? "Só um instante…" : ""}
          </p>
        </form>
      )}
      {step !== "success" && (
        <p className="access-note">
          <LockKeyhole size={18} aria-hidden="true" />
          <span>
            {step === "email"
              ? "Precisa de ajuda? Fale com sua equipe."
              : "Se atualizar a página, você precisará começar de novo."}
          </span>
        </p>
      )}
    </AuthLayout>
  );
}

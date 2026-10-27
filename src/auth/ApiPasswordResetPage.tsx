import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiEndpoint } from "../integrations/api-endpoint";
import { AuthLayout } from "../components/AuthLayout";
import { usePageTitle } from "../components/usePageTitle";

async function resetRequest(path: string, body: object): Promise<void> {
  let response: Response;
  try {
    response = await fetch(apiEndpoint("/api/v1/auth/password-reset/" + path), {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body), credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(12000),
    });
  } catch { throw new Error("Não foi possível conectar ao servidor. Tente novamente."); }
  if (response.ok) return;
  if (response.status === 429) throw new Error("Muitas solicitações. Tente novamente mais tarde.");
  if (response.status === 503) throw new Error("Recuperação indisponível no momento. Contate a administração.");
  if (response.status === 400) throw new Error("Confira os dados informados.");
  throw new Error("Não foi possível processar sua solicitação.");
}

export function ApiPasswordResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const confirming = /^[0-9a-f]{64}$/.test(token);
  usePageTitle(confirming ? "Criar nova senha" : "Recuperação de acesso");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (confirming && (password.length < 8 || password !== repeat)) {
      setError("As senhas devem coincidir e conter pelo menos 8 caracteres.");
      return;
    }
    setBusy(true); setError("");
    try {
      if (confirming) await resetRequest("confirm", { token, password });
      else await resetRequest("request", { email: email.trim().toLowerCase() });
      setSuccess(true); setPassword(""); setRepeat("");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível continuar."); }
    finally { setBusy(false); }
  }
  return <AuthLayout titleId="api-reset-title"><main className="local-page operational-page">
    <header className="local-page-head"><div><h1 id="api-reset-title">{confirming ? "Defina sua nova senha" : "Recuperar acesso"}</h1>
      <p>{confirming ? "Sua nova senha substituirá a anterior." : "Informe seu e-mail corporativo para receber o link de recuperação."}</p></div></header>
    <section className="local-form operational-single-form">
      {success ? <>
        <p role="status" className="local-note">{confirming ? "Senha atualizada. Faça login com a nova senha." : "Se existir uma conta ativa para este e-mail, enviaremos um link. Confira também o spam."}</p>
        <Link className="local-primary" to="/login">Ir para login</Link>
      </> : <form onSubmit={e => void submit(e)} className="local-fields">
        {!confirming ? <label>E-mail corporativo *<input autoComplete="email" type="email" required maxLength={150} value={email} onChange={e => setEmail(e.target.value)} /></label> : <>
          <label>Nova senha *<input autoComplete="new-password" type="password" minLength={8} maxLength={1024} required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label>Repita a senha *<input autoComplete="new-password" type="password" minLength={8} maxLength={1024} required value={repeat} onChange={e => setRepeat(e.target.value)} /></label>
        </>}
        {error && <p role="alert" className="local-message is-error">{error}</p>}
        <div className="local-actions"><button className="local-primary" type="submit" disabled={busy}>{busy ? "Processando…" : confirming ? "Redefinir senha" : "Solicitar link"}</button>
          <Link className="local-secondary-button" to="/login">Voltar ao login</Link></div>
      </form>}
    </section>
  </main></AuthLayout>;
}

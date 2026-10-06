import { parseUser } from "./types";
export class AuthError extends Error {
  constructor(
    public readonly kind: "invalid" | "unavailable" | "rate-limit" | "contract",
    public readonly status?: number,
  ) {
    super(kind);
  }
}
export const ERROR_COPY = {
  invalid: "E-mail ou senha inválidos. Confira os dados e tente de novo.",
  unavailable: "Não conseguimos conectar agora. Tente de novo em instantes.",
  "rate-limit":
    "Você tentou várias vezes. Espere um pouco antes de tentar de novo.",
  contract:
    "Não conseguimos entrar na sua conta. Tente de novo ou peça ajuda à sua equipe.",
};
const REQUEST_TIMEOUT = 12_000;
export async function authRequest(
  path: string,
  method: "GET" | "POST",
  signal?: AbortSignal,
  body?: Record<string, unknown>,
) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal: combined,
      credentials: "include",
      cache: "no-store",
      headers: body
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    if (signal?.aborted)
      throw new DOMException("Requisição cancelada", "AbortError");
    throw new AuthError("unavailable");
  }
  if (response.status === 401 || response.status === 403)
    throw new AuthError("invalid", response.status);
  if (response.status === 429) throw new AuthError("rate-limit");
  if (!response.ok) throw new AuthError("unavailable", response.status);
  return response;
}
async function session(response: Response) {
  try {
    return parseUser(await response.json());
  } catch {
    throw new AuthError("contract");
  }
}
export const authApi = {
  async login(login: string, password: string, signal?: AbortSignal) {
    return session(
      await authRequest("/auth/login", "POST", signal, { login, password }),
    );
  },
  async me(signal?: AbortSignal) {
    return session(await authRequest("/auth/me", "GET", signal));
  },
  async logout(signal?: AbortSignal) {
    await authRequest("/auth/logout", "POST", signal);
  },
};

import { parseUser, type User } from "./types";

export const API_MODE = import.meta.env.VITE_AV_LOCAL_API !== "false";

export class AuthError extends Error {
  constructor(
    public readonly kind: "invalid" | "unavailable" | "rate-limit" | "contract",
    public readonly status?: number,
  ) {
    super(kind);
  }
}
export const ERROR_COPY = {
  invalid: "E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.",
  unavailable: "Não foi possível conectar ao serviço. Tente novamente.",
  "rate-limit": "Muitas tentativas. Aguarde antes de tentar novamente.",
  contract: "Não foi possível verificar seu acesso. Tente novamente ou contate a administração.",
};

const REQUEST_TIMEOUT = 12_000;
type ActiveSession = { token: string; user: User; expiresAt: number };
// O backend só fornece JWT de 15 minutos; mantê-lo apenas em memória evita
// persistência de credenciais no navegador. Recarregar exige novo login.
let activeSession: ActiveSession | null = null;

export function clearLocalSession() {
  activeSession = null;
}
export function getAccessToken() {
  if (!activeSession || Date.now() >= activeSession.expiresAt) {
    clearLocalSession();
    return null;
  }
  return activeSession.token;
}

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
      credentials: API_MODE ? "same-origin" : "include",
      cache: "no-store",
      headers: body
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    if (signal?.aborted) throw new DOMException("Requisição cancelada", "AbortError");
    throw new AuthError("unavailable");
  }
  if (response.status === 401 || response.status === 403)
    throw new AuthError("invalid", response.status);
  if (response.status === 429) throw new AuthError("rate-limit", response.status);
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
    if (!API_MODE) {
      return session(await authRequest("/auth/login", "POST", signal, { login, password }));
    }
    clearLocalSession();
    const response = await authRequest("/api/v1/auth/login", "POST", signal, {
      email: login, password,
    });
    try {
      const payload = await response.json();
      const user = parseUser(payload);
      if (
        !payload || typeof payload.accessToken !== "string" ||
        !payload.accessToken || payload.tokenType !== "Bearer" ||
        !Number.isInteger(payload.expiresIn) ||
        payload.expiresIn < 1 || payload.expiresIn > 900
      ) throw new Error("invalid-token");
      if (signal?.aborted) throw new DOMException("Requisição cancelada", "AbortError");
      activeSession = { token: payload.accessToken, user, expiresAt: Date.now() + payload.expiresIn * 1000 };
      return user;
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new AuthError("contract");
    }
  },
  async me(signal?: AbortSignal) {
    if (API_MODE) {
      if (signal?.aborted) throw new DOMException("Requisição cancelada", "AbortError");
      if (!getAccessToken() || !activeSession) throw new AuthError("invalid", 401);
      return activeSession.user;
    }
    return session(await authRequest("/auth/me", "GET", signal));
  },
  async logout(signal?: AbortSignal) {
    if (API_MODE) {
      clearLocalSession();
      return;
    }
    await authRequest("/auth/logout", "POST", signal);
  },
};

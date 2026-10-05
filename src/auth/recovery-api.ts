import { authRequest, AuthError } from "./api";

// Proposed recovery contract; keep adaptation here when the backend is available.
export interface RecoveryChallenge {
  challengeId: string;
  codeLength: number;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  passwordPolicy: { minLength: number; maxLength: number };
}
export interface ResetGrant {
  resetToken: string;
  expiresInSeconds: number;
}
export class RecoveryError extends Error {
  constructor(
    public readonly kind:
      "code" | "expired" | "policy" | "unavailable" | "rate-limit" | "contract",
  ) {
    super(kind);
  }
}
export const RECOVERY_COPY = {
  code: "Código inválido ou expirado. Confira o código ou solicite um novo.",
  expired:
    "Sua autorização expirou. Recomece a recuperação para receber um novo código.",
  policy:
    "Essa senha não atende à política de segurança. Escolha outra senha e tente novamente.",
  unavailable: "O serviço de recuperação está indisponível. Tente novamente.",
  "rate-limit": "Muitas tentativas. Aguarde antes de tentar novamente.",
  contract:
    "Não foi possível continuar a recuperação. Tente novamente ou contate a administração.",
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RecoveryError("contract");
  return value as Record<string, unknown>;
}
function integer(
  value: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}
async function response(
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  operation: "request" | "verify" | "reset",
) {
  try {
    return await authRequest(path, "POST", signal, body);
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof AuthError) {
      if (error.kind === "rate-limit") throw new RecoveryError("rate-limit");
      if (
        operation === "verify" &&
        [400, 401, 403, 410, 422].includes(error.status ?? 0)
      )
        throw new RecoveryError("code");
      if (
        operation === "reset" &&
        [400, 401, 403, 410].includes(error.status ?? 0)
      )
        throw new RecoveryError("expired");
      if (operation === "reset" && error.status === 422)
        throw new RecoveryError("policy");
    }
    throw new RecoveryError("unavailable");
  }
}
async function json(result: Response) {
  try {
    return record(await result.json());
  } catch {
    throw new RecoveryError("contract");
  }
}
export const recoveryApi = {
  async request(
    email: string,
    signal: AbortSignal,
  ): Promise<RecoveryChallenge> {
    const data = await json(
      await response("/auth/password/request", { email }, signal, "request"),
    );
    const policy = record(data.passwordPolicy);
    if (
      typeof data.challengeId !== "string" ||
      !data.challengeId ||
      !integer(data.codeLength, 6, 12) ||
      !integer(data.expiresInSeconds, 1, 86400) ||
      !integer(data.resendAfterSeconds, 0, 86400) ||
      !integer(policy.minLength, 1, 1024) ||
      !integer(policy.maxLength, policy.minLength as number, 1024)
    )
      throw new RecoveryError("contract");
    return {
      challengeId: data.challengeId,
      codeLength: data.codeLength,
      expiresInSeconds: data.expiresInSeconds,
      resendAfterSeconds: data.resendAfterSeconds,
      passwordPolicy: {
        minLength: policy.minLength,
        maxLength: policy.maxLength,
      },
    };
  },
  async verify(
    challengeId: string,
    code: string,
    signal: AbortSignal,
  ): Promise<ResetGrant> {
    const data = await json(
      await response(
        "/auth/password/verify",
        { challengeId, code },
        signal,
        "verify",
      ),
    );
    if (
      typeof data.resetToken !== "string" ||
      !data.resetToken ||
      !integer(data.expiresInSeconds, 1, 86400)
    )
      throw new RecoveryError("contract");
    return {
      resetToken: data.resetToken,
      expiresInSeconds: data.expiresInSeconds,
    };
  },
  async reset(resetToken: string, password: string, signal: AbortSignal) {
    await response(
      "/auth/password/reset",
      { resetToken, password },
      signal,
      "reset",
    );
  },
};

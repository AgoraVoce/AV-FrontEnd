export const ROLES = ["RECEPCIONISTA", "MEDICO", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];
export interface User {
  id: string;
  name: string;
  login: string;
  role: Role;
}
export const HOME_BY_ROLE: Record<Role, string> = {
  RECEPCIONISTA: "/recepcao",
  MEDICO: "/medico",
  ADMIN: "/admin",
};
export const LABEL_BY_ROLE: Record<Role, string> = {
  RECEPCIONISTA: "Recepção",
  MEDICO: "Médico",
  ADMIN: "Administração",
};
export function parseUser(payload: unknown): User {
  if (!payload || typeof payload !== "object" || !("user" in payload))
    throw new Error("invalid-session");
  const value = payload.user;
  if (!value || typeof value !== "object") throw new Error("invalid-session");
  const data = value as Record<string, unknown>;
  if (
    typeof data.id !== "string" ||
    !data.id ||
    typeof data.name !== "string" ||
    !data.name ||
    typeof (data.login ?? data.email) !== "string" ||
    !(data.login ?? data.email) ||
    !ROLES.includes(data.role as Role)
  )
    throw new Error("invalid-session");
  return {
    id: data.id,
    name: data.name,
    login: (data.login ?? data.email) as string,
    role: data.role as Role,
  };
}

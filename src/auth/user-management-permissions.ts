import type { Role } from "./types";

export const USER_ROLE_LABELS: Record<Role, string> = {
  MEDICO: "Médico",
  RECEPCIONISTA: "Recepcionista",
  ADMIN: "Administrador",
};

const ASSIGNABLE_ROLES: Record<Role, readonly Role[]> = {
  ADMIN: ["MEDICO", "RECEPCIONISTA", "ADMIN"],
  RECEPCIONISTA: ["MEDICO", "RECEPCIONISTA"],
  MEDICO: [],
};

export function getAssignableRoles(actor: Role): readonly Role[] {
  return ASSIGNABLE_ROLES[actor];
}

export function canCreateUserWithRole(actor: Role, requested: Role): boolean {
  return ASSIGNABLE_ROLES[actor].includes(requested);
}

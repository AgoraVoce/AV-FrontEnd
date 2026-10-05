import type { Role, User } from "./types";

// These gates control UI visibility only. The API must authorize every request.
export const AREA_PERMISSION_BY_ROLE = {
  RECEPCIONISTA: "area.recepcao.view",
  MEDICO: "area.medico.view",
  ADMIN: "area.admin.view",
} as const;

export type Permission = (typeof AREA_PERMISSION_BY_ROLE)[Role];

const PERMISSIONS_BY_ROLE: Record<Role, readonly Permission[]> = {
  RECEPCIONISTA: [AREA_PERMISSION_BY_ROLE.RECEPCIONISTA],
  MEDICO: [AREA_PERMISSION_BY_ROLE.MEDICO],
  ADMIN: [AREA_PERMISSION_BY_ROLE.ADMIN],
};

export function hasPermission(user: User | null, permission: Permission) {
  return Boolean(user && PERMISSIONS_BY_ROLE[user.role]?.includes(permission));
}

import type { Employee } from "../../integrations/operational-api";
import { allPages, page, record, request } from "../clinic/api";
import type {
  OwnProfile,
  Professional,
  ProfessionalInput,
} from "../clinic/types";
export const doctorsApi = {
  list: (
    q: string,
    specialtyId: string,
    active: string,
    p: number,
    signal?: AbortSignal,
  ) =>
    request(
      "/admin/doctors?" +
        new URLSearchParams({
          ...(q.trim() ? { q: q.trim() } : {}),
          ...(specialtyId ? { specialtyId } : {}),
          ...(active ? { active } : {}),
          page: String(p),
          pageSize: "10",
        }),
      "GET",
      undefined,
      signal,
    ).then(page<Professional>),
  all: (signal?: AbortSignal) =>
    allPages<Professional>("/admin/doctors", signal),
  save: (input: ProfessionalInput, id?: string, previous?: Professional) => {
    const original: Record<string, unknown> = previous
      ? { ...previous, email: previous.user.email }
      : {};
    const body = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) =>
          value !== undefined &&
          !(key === "phone" && value === null) &&
          !(id && key === "password") &&
          (!previous || value !== original[key]),
      ),
    );
    if (previous && !Object.keys(body).length) return Promise.resolve(previous);
    return request(
      id ? "/doctors/" + encodeURIComponent(id) : "/admin/doctors",
      id ? "PATCH" : "POST",
      body,
    ).then(record<Professional>);
  },
  unlinked: async (signal?: AbortSignal) => {
    const [accounts, doctors] = await Promise.all([
      allPages<Employee>("/employees", signal, {
        role: "MEDICO",
        active: "true",
      }),
      allPages<Professional>("/admin/doctors", signal),
    ]);
    const linked = new Set(doctors.map((d) => d.userId));
    return accounts.filter((a) => !linked.has(a.id));
  },
  link: (userId: string, specialtyId: string) =>
    request("/doctors", "POST", { userId, specialtyId, active: true }).then(
      record<Professional>,
    ),
  reactivate: (id: string) => request("/doctors/" + encodeURIComponent(id), "PATCH", { active: true }),
  deactivate: (id: string) =>
    request("/doctors/" + encodeURIComponent(id), "PATCH", { active: false }),
  own: (signal?: AbortSignal) =>
    request("/doctors/me/profile", "GET", undefined, signal).then(
      record<OwnProfile>,
    ),
};

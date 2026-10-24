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
          q,
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
  save: (input: ProfessionalInput, id?: string) =>
    request(
      "/admin/doctors" + (id ? "/" + encodeURIComponent(id) : ""),
      id ? "PATCH" : "POST",
      input,
    ).then(record<Professional>),
  deactivate: (id: string) =>
    request("/doctors/" + encodeURIComponent(id), "PATCH", { active: false }),
  own: (signal?: AbortSignal) =>
    request("/doctors/me/profile", "GET", undefined, signal).then(
      record<OwnProfile>,
    ),
};

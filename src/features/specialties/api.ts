import { allPages, record, request } from "../clinic/api";
import type { Specialty } from "../clinic/types";
export const specialtiesApi = {
  list: (signal?: AbortSignal) => allPages<Specialty>("/specialties", signal),
  save: (input: Pick<Specialty, "name" | "active">, id?: string) =>
    request(
      "/specialties" + (id ? "/" + encodeURIComponent(id) : ""),
      id ? "PATCH" : "POST",
      input,
    ).then(record<Specialty>),
  remove: (id: string) =>
    request("/specialties/" + encodeURIComponent(id), "DELETE"),
};

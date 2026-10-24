import { items, request } from "../clinic/api";
import type { Shift, ShiftInput } from "../clinic/types";
export const shiftsApi = {
  list: (own: boolean, signal?: AbortSignal) =>
    request(
      own ? "/doctors/me/shifts" : "/admin/shifts",
      "GET",
      undefined,
      signal,
    ).then(items<Shift>),
  save: (doctorId: string, input: ShiftInput, id?: string, until?: string) =>
    request(
      "/doctors/" +
        encodeURIComponent(doctorId) +
        "/shifts" +
        (id ? "/" + encodeURIComponent(id) : until ? "/series" : ""),
      id ? "PATCH" : "POST",
      { ...input, ...(until ? { until } : {}) },
    ),
  cancel: (shift: Shift) =>
    request(
      "/doctors/" +
        encodeURIComponent(shift.doctorId) +
        "/shifts/" +
        encodeURIComponent(shift.id),
      "PATCH",
      { availabilityStatus: "INDISPONIVEL" },
    ),
};

import { allPages, items, request } from "../clinic/api";
import type { Shift, ShiftInput } from "../clinic/types";
export const shiftsApi = {
  list: (own: boolean, signal?: AbortSignal) =>
    own
      ? request("/doctors/me/shifts", "GET", undefined, signal).then(
          items<Shift>,
        )
      : allPages<Shift>("/admin/shifts", signal),
  save: (doctorId: string, input: ShiftInput, id?: string) =>
    request(
      "/doctors/" +
        encodeURIComponent(doctorId) +
        "/shifts" +
        (id ? "/" + encodeURIComponent(id) : ""),
      id ? "PATCH" : "POST",
      input,
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

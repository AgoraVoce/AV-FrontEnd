import { items, record, request } from "../clinic/api";
import type { Room } from "../clinic/types";
export const roomsApi = {
  list: (signal?: AbortSignal) =>
    request("/rooms", "GET", undefined, signal).then(items<Room>),
  save: (input: Omit<Room, "id">, id?: string) =>
    request(
      "/rooms" + (id ? "/" + encodeURIComponent(id) : ""),
      id ? "PATCH" : "POST",
      input,
    ).then(record<Room>),
  remove: (id: string) => request("/rooms/" + encodeURIComponent(id), "DELETE"),
};

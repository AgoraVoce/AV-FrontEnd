import { ApiError, request } from "../../integrations/client";
import type { Page } from "../../integrations/operational-api";
export { request };
export function record<T>(value: unknown): T {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string"
  )
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "A API retornou um registro inválido.",
    );
  return value as T;
}
export function items<T>(value: unknown): T[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("items" in value) ||
    !Array.isArray(value.items)
  )
    throw new ApiError(
      502,
      "BAD_RESPONSE",
      "A API retornou uma lista inválida.",
    );
  return value.items.map(record<T>);
}
export function page<T>(value: unknown): Page<T> {
  const list = items<T>(value),
    raw = value as Page<T>;
  if (
    !Number.isInteger(raw.total) ||
    !Number.isInteger(raw.page) ||
    !Number.isInteger(raw.pageSize) ||
    raw.pageSize < 1
  )
    throw new ApiError(502, "BAD_RESPONSE", "A paginação da API é inválida.");
  return { ...raw, items: list };
}
export async function allPages<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const first = page<T>(
    await request(path + "?page=1&pageSize=100", "GET", undefined, signal),
  );
  const result = [...first.items];
  for (let p = 2; (p - 1) * 100 < first.total; p++)
    result.push(
      ...page<T>(
        await request(
          path + "?page=" + p + "&pageSize=100",
          "GET",
          undefined,
          signal,
        ),
      ).items,
    );
  return result;
}

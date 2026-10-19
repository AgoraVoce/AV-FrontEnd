import { ApiError } from "./client";
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Não foi possível concluir a operação. Confira a conexão e tente novamente.";
}
export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
}

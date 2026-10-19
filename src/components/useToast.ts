import { useContext, useMemo } from "react";
import { ToastContext } from "./toast-context";

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast requer ToastProvider");
  return useMemo(() => ({
    success: (title: string, description?: string) => notify(title, "success", description),
    error: (title: string, description?: string) => notify(title, "error", description),
    info: (title: string, description?: string) => notify(title, "info", description),
  }), [notify]);
}

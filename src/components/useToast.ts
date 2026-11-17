import { useContext, useMemo } from "react";
import { ToastContext } from "./toast-context";

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast requer ToastProvider");
  return useMemo(
    () => ({
      success: (title: string, description?: string) =>
        notify.notify(title, "success", description),
      error: (title: string, description?: string) =>
        notify.notify(title, "error", description),
      info: (title: string, description?: string) =>
        notify.notify(title, "info", description),
      clear: notify.clear,
    }),
    [notify],
  );
}

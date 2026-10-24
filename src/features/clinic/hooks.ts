import { useEffect, useRef, useState } from "react";
import { useToast } from "../../components/useToast";
import { ApiError } from "../../integrations/client";
import { errorText } from "../../integrations/shared-helpers";
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      load(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setData(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorText(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, revision]);
  return { data, loading, error, reload: () => setRevision((n) => n + 1) };
}
export function useSave(onSuccess: () => void) {
  const toast = useToast(),
    lock = useRef(false),
    lastError = useRef<unknown>(null);
  const [saving, setSaving] = useState(false),
    [fields, setFields] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  async function run(work: () => Promise<unknown>) {
    if (lock.current) return false;
    lock.current = true;
    lastError.current = null;
    setSaving(true);
    setFields({});
    setError("");
    try {
      await work();
      toast.success(
        "Alteração salva",
        "Os dados foram atualizados com sucesso.",
      );
      onSuccess();
      return true;
    } catch (e) {
      lastError.current = e;
      setFields(e instanceof ApiError ? e.fields : {});
      setError(errorText(e));
      toast.error("Não foi possível salvar", errorText(e));
      return false;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return { saving, fields, error, run, lastError };
}

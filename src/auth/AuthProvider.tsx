import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AuthContext } from "./context";
import type { SessionState } from "./context";
import { authApi, AuthError } from "./api";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: "checking",
    user: null,
  });
  const current = useRef<AbortController | null>(null);
  const version = useRef(0);
  const mutation = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const verifySession = useCallback(async () => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const stamp = ++version.current;
    try {
      const user = await authApi.me(controller.signal);
      if (!controller.signal.aborted && stamp === version.current)
        setState({ status: "authenticated", user });
    } catch (error) {
      if (!controller.signal.aborted && stamp === version.current)
        setState({
          status:
            error instanceof AuthError && error.kind === "invalid"
              ? "anonymous"
              : "error",
          user: null,
        });
    }
  }, []);
  const restore = useCallback(async () => {
    if (mutation.current) return;
    setState({ status: "checking", user: null });
    await verifySession();
  }, [verifySession]);
  // Initial checking state already exists; only the async API completion updates it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Only async session completion updates state; no synchronous update.
    void verifySession();
    return () => {
      current.current?.abort();
    };
  }, [verifySession]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void restore();
    };
    document.addEventListener("visibilitychange", onVisible);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("av-auth");
      channel.current.onmessage = () => {
        void restore();
      };
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      channel.current?.close();
    };
  }, [restore]);
  const signIn = useCallback(
    async (login: string, password: string, signal: AbortSignal) => {
      const stamp = ++version.current;
      current.current?.abort();
      mutation.current = true;
      // A new login supersedes session restoration, including an unavailable API.
      setState({ status: "anonymous", user: null });
      try {
        const user = await authApi.login(login, password, signal);
        if (!signal.aborted && stamp === version.current) {
          setState({ status: "authenticated", user });
          channel.current?.postMessage("session-changed");
        }
        return user;
      } finally {
        mutation.current = false;
      }
    },
    [],
  );
  const signOut = useCallback(async (signal: AbortSignal) => {
    const stamp = ++version.current;
    current.current?.abort();
    mutation.current = true;
    try {
      try {
        await authApi.logout(signal);
      } catch (error) {
        if (!(error instanceof AuthError && error.status === 401)) throw error;
      }
      if (!signal.aborted && stamp === version.current) {
        setState({ status: "anonymous", user: null });
        channel.current?.postMessage("session-changed");
      }
    } finally {
      mutation.current = false;
    }
  }, []);
  const invalidateSession = useCallback(() => {
    ++version.current;
    current.current?.abort();
    setState({ status: "anonymous", user: null });
    channel.current?.postMessage("session-changed");
  }, []);
  return (
    <AuthContext.Provider
      value={{ state, restore, signIn, signOut, invalidateSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

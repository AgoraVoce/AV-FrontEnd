import { createContext, useContext } from "react";
import type { User } from "./types";
export type SessionState =
  | { status: "checking"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "error"; user: null }
  | { status: "authenticated"; user: User };
export interface AuthContextValue {
  state: SessionState;
  restore: () => Promise<void>;
  signIn: (
    login: string,
    password: string,
    signal: AbortSignal,
  ) => Promise<User>;
  signOut: (signal: AbortSignal) => Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider obrigatório");
  return context;
}

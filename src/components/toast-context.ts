import { createContext } from "react";

export type ToastTone = "success" | "error" | "info";
export type ToastNotify = (title: string, tone?: ToastTone, description?: string) => void;
export const ToastContext = createContext<ToastNotify | null>(null);

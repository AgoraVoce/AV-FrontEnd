import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ToastContext, type ToastTone as Tone, type ToastNotify as Notify } from "./toast-context";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import "./toast.css";

type Message = { id: number; tone: Tone; title: string; description?: string };
let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const notify = useCallback<Notify>((title, tone = "info", description) => {
    setMessages((current) => [...current.slice(-3), { id: ++nextId, tone, title, description }]);
  }, []);
  const remove = useCallback((id: number) => setMessages((current) => current.filter((item) => item.id !== id)), []);
  return <ToastContext.Provider value={notify}>
    {children}
    <div className="av-toast-stack" aria-label="Notificações do sistema">
      {messages.map((message) => <ToastItem key={message.id} message={message} onClose={() => remove(message.id)} />)}
    </div>
  </ToastContext.Provider>;
}

function ToastItem({ message, onClose }: { message: Message; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, message.tone === "error" ? 7000 : 4800);
    return () => window.clearTimeout(timer);
  }, [message.id, message.tone, onClose]);
  const Icon = message.tone === "success" ? CheckCircle2 : message.tone === "error" ? AlertCircle : Info;
  return <div className={"av-toast is-" + message.tone} role={message.tone === "error" ? "alert" : "status"}>
    <Icon size={19} aria-hidden="true" className="av-toast-icon" />
    <div className="av-toast-copy">
      <strong>{message.title}</strong>
      {message.description && <p>{message.description}</p>}
    </div>
    <button type="button" aria-label="Fechar notificação" className="av-toast-close" onClick={onClose}><X size={16} aria-hidden="true" /></button>
  </div>;
}


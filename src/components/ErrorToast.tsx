import { AlertCircle, X } from "lucide-react";
import { createPortal } from "react-dom";

// One controlled notification slot: repeated errors replace rather than stack.
export function ErrorToast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  return createPortal(
    <section className="toast-viewport" aria-label="Notificações">
      {message && (
        <div className="error-toast">
          <AlertCircle size={22} aria-hidden="true" />
          <p role="alert" aria-atomic="true">
            {message}
          </p>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Fechar aviso"
            onClick={onDismiss}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>,
    document.body,
  );
}

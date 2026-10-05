import { AlertCircle, LoaderCircle } from "lucide-react";
export function Spinner() {
  return <LoaderCircle className="spinner" size={20} aria-hidden="true" />;
}
export function Feedback({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="feedback" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        <p>{message}</p>
        {retry && (
          <button type="button" className="text-button" onClick={retry}>
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ClipboardCheck, FileText, X } from "lucide-react";
import type { QueuePatient } from "../../reception/types";

export type DischargeRecord = {
  summary: string;
  prescription: string;
  guidance: string;
};

export function MedicalDischargeModal({
  patient,
  error,
  onClose,
  onConfirm,
}: {
  patient: QueuePatient;
  error: string;
  onClose: () => void;
  onConfirm: (record: DischargeRecord) => boolean;
}) {
  const [summary, setSummary] = useState("");
  const [prescription, setPrescription] = useState("");
  const [guidance, setGuidance] = useState("");
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const confirmed = summary.trim().length >= 10 && prescription.trim().length >= 10;

  useEffect(() => {
    summaryRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>(".doctor-discharge-dialog");
        const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)') ?? []);
        if (!controls.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    onConfirm({
      summary: summary.trim(),
      prescription: prescription.trim(),
      guidance: guidance.trim(),
    });
  }

  return (
    <div className="doctor-discharge-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="doctor-discharge-dialog" role="dialog" aria-modal="true" aria-labelledby="doctor-discharge-title" aria-describedby="doctor-discharge-description">
        <div className="doctor-discharge-header">
          <div><p>REGISTRO DO CASO · DEMONSTRAÇÃO</p><h2 id="doctor-discharge-title"><ClipboardCheck size={21} aria-hidden="true" />Finalização do atendimento</h2></div>
          <button ref={closeRef} type="button" className="doctor-discharge-close" aria-label="Fechar modal" onClick={onClose}><X size={19} aria-hidden="true" /></button>
        </div>
        <p className="doctor-discharge-description" id="doctor-discharge-description">Confira o paciente e preencha a conclusão clínica antes de liberar a fila. Cancelar não altera o atendimento.</p>
        <div className="doctor-discharge-patient">
          <span><strong>{patient.name}</strong><small>{patient.age} anos · Senha {patient.ticket}</small></span>
          <span className="doctor-discharge-priority">{patient.priority === "urgent" ? "Urgente" : patient.priority === "alert" ? "Alerta" : "Tranquilo"}</span>
        </div>
        <p className="doctor-discharge-complaint"><strong>Queixa inicial:</strong> {patient.complaint}</p>
        <form onSubmit={submit} className="doctor-discharge-form">
          <label htmlFor="discharge-summary">Resumo clínico / hipótese diagnóstica <span>*</span></label>
          <textarea ref={summaryRef} id="discharge-summary" required minLength={10} maxLength={2000} rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Descreva a avaliação realizada e a conclusão do caso." />
          <label htmlFor="discharge-prescription">Prescrição ou conduta adotada <span>*</span></label>
          <textarea id="discharge-prescription" required minLength={10} maxLength={3000} rows={4} value={prescription} onChange={(event) => setPrescription(event.target.value)} placeholder="Registre medicamentos com posologia quando indicados ou declare a conduta sem medicação." />
          <label htmlFor="discharge-guidance">Orientações adicionais / retorno (opcional)</label>
          <textarea id="discharge-guidance" maxLength={2000} rows={2} value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="Cuidados, sinais de alerta, acompanhamento e retorno." />
          <p className="doctor-discharge-helper"><FileText size={14} aria-hidden="true" />Campos obrigatórios: no mínimo 10 caracteres. Nenhum dado é salvo em prontuário ou enviado para API.</p>
          {error && <p className="doctor-discharge-error" role="alert">{error}</p>}
          <div className="doctor-discharge-footer">
            <button className="doctor-discharge-cancel" type="button" onClick={onClose}>Voltar ao atendimento</button>
            <button className="doctor-discharge-confirm" type="submit" disabled={!confirmed}><ClipboardCheck size={16} aria-hidden="true" />Confirmar finalização</button>
          </div>
        </form>
      </section>
    </div>
  );
}

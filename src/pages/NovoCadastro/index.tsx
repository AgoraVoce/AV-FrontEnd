import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Activity, Clock3, HeartPulse, Zap } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { CardResultadoTriagem } from "../../components/triagem/CardResultadoTriagem";
import {
  ChecklistSintomas,
  SYMPTOMS,
} from "../../components/triagem/ChecklistSintomas";
import { IdentificacaoPaciente } from "../../components/triagem/IdentificacaoPaciente";
import { LegendaPrioridades } from "../../components/triagem/LegendaPrioridades";
import { SinaisClinicos } from "../../components/triagem/SinaisClinicos";
import { TriagemHeader } from "../../components/triagem/TriagemHeader";
import { useAuth } from "../../auth/context";
import { usePageTitle } from "../../components/usePageTitle";
import {
  addPatientToQueue,
  getQueueSnapshot,
} from "../../reception/queue-store";
import type { Priority } from "../../reception/types";
import "./novo-cadastro.css";

interface PatientForm {
  nome: string;
  idade: string;
  cpf: string;
  queixa: string;
  temperatura: string;
  dor: number;
  sintomas: string[];
}

const INITIAL_FORM: PatientForm = {
  nome: "Carlos Eduardo da Silva",
  idade: "42",
  cpf: "123.456.789-00",
  queixa: "Dor intensa no peito, iniciada há cerca de 20 minutos.",
  temperatura: "38.2",
  dor: 8,
  sintomas: ["chest-pain"],
};

function assessPriority(form: PatientForm): Priority {
  const highRisk = SYMPTOMS.some(
    (symptom) => symptom.highRisk && form.sintomas.includes(symptom.id),
  );
  if (highRisk || form.dor >= 9) return "urgent";
  if (
    form.dor >= 5 ||
    Number(form.temperatura) >= 38 ||
    form.sintomas.includes("vomiting")
  )
    return "alert";
  return "calm";
}

function summarizeReason(form: PatientForm, priority: Priority) {
  const reasons = SYMPTOMS.filter((symptom) =>
    form.sintomas.includes(symptom.id),
  ).map((symptom) => symptom.label.toLowerCase());
  if (priority === "urgent") {
    const trigger = reasons[0] ?? "dor intensa";
    return `Classificação vermelha indicada por ${trigger}${form.dor >= 7 ? ` e dor intensa (${form.dor}/10)` : ""}. Avaliação médica imediata recomendada pelo protocolo de Manchester.`;
  }
  if (priority === "alert") {
    return `Sinais de alerta identificados${Number(form.temperatura) >= 38 ? `, temperatura febril de ${form.temperatura} °C` : ""}${form.dor >= 5 ? ` e dor ${form.dor}/10` : ""}. Priorizar avaliação clínica.`;
  }
  return "Sem sinal de emergência imediata identificado no checklist. Manter observação e seguir a ordem de classificação clínica.";
}

function suggestedTicket(priority: Priority) {
  const prefix: Record<Priority, string> = {
    urgent: "U",
    alert: "A",
    calm: "T",
  };
  const start: Record<Priority, number> = { urgent: 42, alert: 53, calm: 91 };
  const nextNumber = Math.max(
    start[priority],
    ...getQueueSnapshot()
      .patients.filter((patient) =>
        patient.ticket.startsWith(`${prefix[priority]}-`),
      )
      .map((patient) => Number(patient.ticket.split("-")[1]) + 1),
  );
  return `${prefix[priority]}-${String(nextNumber).padStart(3, "0")}`;
}

export default function NovoCadastroPage() {
  usePageTitle("Novo Cadastro e Triagem Rápida");
  const { state: authState } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [calculado, setCalculado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [formError, setFormError] = useState("");
  const [registeredTicket, setRegisteredTicket] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const priority = assessPriority(form);
  const ticket = registeredTicket || suggestedTicket(priority);
  const rationale = useMemo(
    () => summarizeReason(form, priority),
    [form, priority],
  );

  const updateField = (
    field: "nome" | "idade" | "cpf" | "queixa" | "temperatura",
    value: string,
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setCalculado(false);
    setConfirmado(false);
    setRegisteredTicket("");
    setFormError("");
  };

  const updateSymptoms = (sintomas: string[]) => {
    setForm((current) => ({ ...current, sintomas }));
    setCalculado(false);
    setConfirmado(false);
    setRegisteredTicket("");
    setFormError("");
  };

  const calculate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const age = Number(form.idade);
    const invalidField = !form.nome.trim()
      ? "nome"
      : !form.idade || !Number.isInteger(age) || age < 0 || age > 120
        ? "idade"
        : !form.queixa.trim()
          ? "queixa"
          : form.temperatura &&
              (!Number.isFinite(Number(form.temperatura)) ||
                Number(form.temperatura) < 30 ||
                Number(form.temperatura) > 45)
            ? "temperatura"
            : "";
    const validationMessage =
      invalidField === "nome"
        ? "Informe o nome completo do paciente."
        : invalidField === "idade"
          ? "Informe uma idade válida entre 0 e 120 anos."
          : invalidField === "queixa"
            ? "Descreva a queixa principal relatada."
            : invalidField === "temperatura"
              ? "Informe uma temperatura entre 30 °C e 45 °C ou deixe o campo vazio."
              : "";
    if (validationMessage) {
      setFormError(validationMessage);
      formRef.current
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          `[name="${invalidField}"]`,
        )
        ?.focus();
      return;
    }
    setCalculado(true);
    setFormError("");
  };

  const confirm = () => {
    if (!calculado || confirmado) return;
    const role =
      authState.status === "authenticated"
        ? authState.user.role
        : "RECEPCIONISTA";
    const result = addPatientToQueue(
      {
        name: form.nome.trim(),
        ...(form.cpf.trim() ? { cpf: form.cpf.trim() } : {}),
        age: Number(form.idade),
        complaint: form.queixa.trim(),
        priority,
        vitals: {
          bloodPressure: "Não aferida",
          heartRate: 0,
          oxygenSaturation: 0,
          temperature: Number(form.temperatura) || 0,
        },
      },
      role,
    );
    if (!result.ok) {
      setFormError(
        "Não foi possível adicionar o paciente. Verifique as permissões e tente novamente.",
      );
      return;
    }
    const added = result.snapshot.patients.at(-1);
    setRegisteredTicket(added?.ticket ?? ticket);
    setConfirmado(true);
    setFormError("");
  };

  const review = () => {
    setCalculado(false);
    setConfirmado(false);
    setFormError("");
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AppShell>
      <div className="new-registration-page">
        <TriagemHeader />

        <div className="nc-page-grid">
          <form
            className="nc-form-column"
            ref={formRef}
            noValidate
            onSubmit={calculate}
          >
            <IdentificacaoPaciente
              nome={form.nome}
              idade={form.idade}
              cpf={form.cpf}
              onChange={updateField}
            />
            <SinaisClinicos
              queixa={form.queixa}
              temperatura={form.temperatura}
              dor={form.dor}
              onChange={updateField}
              onDorChange={(dor) => {
                setForm((current) => ({ ...current, dor }));
                setCalculado(false);
                setConfirmado(false);
                setRegisteredTicket("");
              }}
            />
            <ChecklistSintomas
              sintomas={form.sintomas}
              onChange={updateSymptoms}
            />
            <button className="nc-generate-button" type="submit">
              <Zap size={18} fill="currentColor" aria-hidden="true" /> Gerar
              Prioridade Automática
            </button>
            {formError && (
              <p className="nc-form-error" role="alert">
                {formError}
              </p>
            )}
            <div
              className="nc-operations-grid"
              aria-label="Informações do plantão"
            >
              <article>
                <span className="nc-operation-icon teal">
                  <Activity size={17} aria-hidden="true" />
                </span>
                <span>
                  <small>ELETROCARDIOGRAMA</small>
                  <strong>Sala 02 Disponível</strong>
                </span>
                <i className="nc-status-dot" />
              </article>
              <article>
                <span className="nc-operation-icon blue">
                  <HeartPulse size={17} aria-hidden="true" />
                </span>
                <span>
                  <small>MÉDICOS NO PLANTÃO</small>
                  <strong>04 Ativos (PS Adulto)</strong>
                </span>
                <i className="nc-status-dot" />
              </article>
              <article>
                <span className="nc-operation-icon coral">
                  <Clock3 size={17} aria-hidden="true" />
                </span>
                <span>
                  <small>TEMPO MÉDIO VERMELHO</small>
                  <strong>08 min (Dentro da meta)</strong>
                </span>
              </article>
            </div>
          </form>
          <div className="nc-result-column">
            <CardResultadoTriagem
              senha={ticket}
              prioridade={priority}
              justificativa={rationale}
              calculado={calculado}
              confirmado={confirmado}
              onConfirmar={confirm}
              onRevisar={review}
            />
            <LegendaPrioridades />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

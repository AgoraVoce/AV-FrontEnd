import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  CheckCircle2,
  Clock3,
  Hourglass,
  Megaphone,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { PriorityBadge } from "../../components/PriorityBadge";
import { usePageTitle } from "../../components/usePageTitle";
import type { Priority } from "../../reception/types";
import "./medico.css";

interface PatientInCare {
  name: string;
  age: number;
  gender: string;
  ticket: string;
  priority: Priority;
  priorityLabel: string;
  complaint: string;
}

interface WaitingPatient {
  ticket: string;
  name: string;
  record: string;
  age: number;
  complaint: string;
  priority: Priority;
  wait: number;
  nurse: string;
}

const DOCTOR = {
  name: "Dr. Marcelo Arantes",
  crm: "CRM 142.890-SP",
  office: "Consultório 04",
  specialty: "Clínica Médica Geral",
};

function getBrasiliaTime() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

const CURRENT_PATIENT: PatientInCare = {
  name: "Roberto Souza Lima",
  age: 67,
  gender: "Masculino",
  ticket: "U-039",
  priority: "urgent",
  priorityLabel: "Urgente (Vermelho)",
  complaint: "Dispneia moderada, tosse produtiva e saturação O2 92%",
};

const NEXT_PATIENT: PatientInCare = {
  name: "Ana Beatriz Rocha",
  age: 34,
  gender: "Feminino",
  ticket: "A-051",
  priority: "alert",
  priorityLabel: "Alerta (Amarelo)",
  complaint: "Cólica renal intensa com náuseas",
};

const WAITING_PATIENTS: WaitingPatient[] = [
  {
    ticket: "A-052",
    name: "Jorge Fernando Alves",
    record: "#88412",
    age: 45,
    complaint: "Suspeita de fratura",
    priority: "alert",
    wait: 32,
    nurse: "Enf. Paula",
  },
  {
    ticket: "T-089",
    name: "Juliana Mendes",
    record: "#88415",
    age: 29,
    complaint: "Sintomas gripais leves",
    priority: "calm",
    wait: 46,
    nurse: "Enf. Paula",
  },
  {
    ticket: "T-090",
    name: "Lucas Gabriel Moreira",
    record: "#88419",
    age: 19,
    complaint: "Escoriação leve no joelho",
    priority: "calm",
    wait: 51,
    nurse: "Enf. Paula",
  },
  {
    ticket: "T-091",
    name: "Camila Duarte",
    record: "#88422",
    age: 38,
    complaint: "Renovação de receita",
    priority: "calm",
    wait: 54,
    nurse: "Enf. Carlos",
  },
];

function PatientIdentity({ patient }: { patient: PatientInCare }) {
  return (
    <div className="doctor-patient-identity">
      <div>
        <h3>{patient.name}</h3>
        <p>
          {patient.age} anos <span aria-hidden="true">•</span> Sexo{" "}
          {patient.gender}
        </p>
      </div>
      <div className="doctor-ticket">
        <span className="doctor-label">SENHA</span>
        <strong>{patient.ticket}</strong>
      </div>
    </div>
  );
}

function PriorityPill({
  priority,
  children,
}: {
  priority: Priority;
  children: string;
}) {
  return (
    <span className={`doctor-priority-pill is-${priority}`}>
      <span aria-hidden="true">●</span>
      {children}
    </span>
  );
}

export default function MedicoPage() {
  usePageTitle("Consultório Médico");
  const [currentTime, setCurrentTime] = useState(getBrasiliaTime);
  const [currentPatient, setCurrentPatient] = useState<PatientInCare | null>(
    CURRENT_PATIENT,
  );
  const [nextPatient, setNextPatient] = useState<PatientInCare | null>(
    NEXT_PATIENT,
  );
  const [callError, setCallError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(getBrasiliaTime());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Finaliza a consulta atual e libera o consultório.
  function handleFinishAppointment() {
    setCurrentPatient(null);
  }

  // Chama o próximo paciente apenas quando o consultório está livre.
  function handleCallNextPatient() {
    if (currentPatient) {
      setCallError("Finalize o atendimento atual antes de chamar o próximo.");
      return;
    }
    if (!nextPatient) return;
    setCallError("");
    setCurrentPatient(nextPatient);
    setNextPatient(null);
  }

  const headerContext = (
    <span className="doctor-header-clinic">
      <Building2 size={14} aria-hidden="true" />
      PRONTO-SOCORRO CENTRAL
    </span>
  );

  const headerTools = (
    <span className="doctor-header-clock">
      <Clock3 size={14} aria-hidden="true" />
      <strong>{currentTime}</strong>
      <span>(Horário de Brasília)</span>
    </span>
  );

  return (
    <AppShell headerContext={headerContext} headerTools={headerTools}>
      <div className="doctor-page">
        <section className="doctor-summary" aria-label="Dados do médico">
          <div className="doctor-summary-main">
            <div className="doctor-summary-icon">
              <Stethoscope size={22} aria-hidden="true" />
              <span aria-label="Disponível" />
            </div>
            <div className="doctor-summary-copy">
              <div className="doctor-name-line">
                <h1>{DOCTOR.name}</h1>
                <span className="doctor-crm">{DOCTOR.crm}</span>
              </div>
              <p>
                <Building2 size={13} aria-hidden="true" />
                {DOCTOR.office} <span aria-hidden="true">•</span>{" "}
                {DOCTOR.specialty}
              </p>
            </div>
          </div>
          <div className="doctor-summary-status">
            <span className="doctor-status-pill">
              <span aria-hidden="true">●</span> Em atendimento
            </span>
            <span className="doctor-summary-divider" aria-hidden="true" />
            <span className="doctor-current-time">
              <Clock3 size={15} aria-hidden="true" />
              <strong>{currentTime}</strong>
              <small>HORÁRIO ATUAL</small>
            </span>
          </div>
        </section>

        <div className="doctor-consultations">
          <section className="doctor-consult-card is-current">
            <div className="doctor-card-heading">
              <h2>
                <UserRound size={15} aria-hidden="true" />
                PACIENTE ATUAL EM CONSULTA
              </h2>
              {currentPatient && (
                <span className="doctor-wait-pill is-urgent">
                  <span aria-hidden="true">●</span> Iniciado há 12 min
                </span>
              )}
            </div>

            {currentPatient ? (
              <>
                <PatientIdentity patient={currentPatient} />
                <div className="doctor-risk-line">
                  <span className="doctor-label">CLASSIFICAÇÃO DE RISCO</span>
                  <PriorityPill priority={currentPatient.priority}>
                    {currentPatient.priorityLabel}
                  </PriorityPill>
                </div>
                <div className="doctor-complaint">
                  <span>Queixa Principal Relatada:</span>
                  <strong>{currentPatient.complaint}</strong>
                </div>
                <div className="doctor-vitals">
                  <h3 className="doctor-label">SINAIS VITAIS NA TRIAGEM</h3>
                  <div className="doctor-vitals-grid">
                    <div>
                      <span>Temperatura</span>
                      <strong className="is-danger">38.4 °C</strong>
                    </div>
                    <div>
                      <span>Pressão Art.</span>
                      <strong>140/90</strong>
                    </div>
                    <div>
                      <span>Escala de Dor</span>
                      <strong>6 / 10</strong>
                    </div>
                  </div>
                </div>
                <button
                  className="doctor-action-button is-finish"
                  type="button"
                  onClick={handleFinishAppointment}
                >
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Finalizar Atendimento
                </button>
              </>
            ) : (
              <div className="doctor-empty-patient">
                Nenhum paciente em consulta.
              </div>
            )}
          </section>

          <section className="doctor-consult-card is-next">
            <div className="doctor-card-heading">
              <h2>
                <Bell size={15} aria-hidden="true" />
                PRÓXIMO DA FILA
              </h2>
              <span className="doctor-wait-pill is-waiting">
                <span aria-hidden="true">●</span> Aguardando chamada
              </span>
            </div>

            {nextPatient ? (
              <>
                <PatientIdentity patient={nextPatient} />
                <div className="doctor-risk-line">
                  <span className="doctor-label">CLASSIFICAÇÃO DE RISCO</span>
                  <PriorityPill priority={nextPatient.priority}>
                    {nextPatient.priorityLabel}
                  </PriorityPill>
                </div>
                <div className="doctor-complaint">
                  <span>Queixa Principal:</span>
                  <strong>{nextPatient.complaint}</strong>
                </div>
                <div className="doctor-wait-time">
                  <span>
                    <Hourglass size={14} aria-hidden="true" />
                    Tempo na espera:
                  </span>
                  <strong>Aguardando há 24 min</strong>
                </div>
                <button
                  className="doctor-action-button is-call"
                  type="button"
                  onClick={handleCallNextPatient}
                >
                  <Megaphone size={15} aria-hidden="true" />
                  Chamar Próximo Paciente ({nextPatient.ticket})
                </button>
                {callError && (
                  <p className="doctor-call-notice" role="status">
                    {callError}
                  </p>
                )}
              </>
            ) : (
              <div className="doctor-empty-patient">
                Não há próximo paciente para chamar.
              </div>
            )}
          </section>
        </div>

        <section className="doctor-queue-card">
          <div className="doctor-queue-heading">
            <div>
              <h2>Fila de Espera Geral</h2>
              <p>
                Pacientes na fila ordenados estritamente por urgência médica
              </p>
            </div>
            <span className="doctor-queue-total">
              Total na fila: <strong>{WAITING_PATIENTS.length}</strong>{" "}
              pacientes
            </span>
          </div>

          <div className="doctor-table-scroll">
            <table className="doctor-queue-table">
              <thead>
                <tr>
                  <th scope="col">SENHA</th>
                  <th scope="col">PACIENTE</th>
                  <th scope="col">IDADE</th>
                  <th scope="col">QUEIXA INICIAL</th>
                  <th scope="col">CLASSIFICAÇÃO</th>
                  <th scope="col">
                    TEMPO DE
                    <br />
                    ESPERA
                  </th>
                  <th scope="col">TRIAGEM</th>
                </tr>
              </thead>
              <tbody>
                {WAITING_PATIENTS.map((patient) => (
                  <tr key={patient.ticket}>
                    <td>
                      <span className="doctor-queue-ticket">
                        {patient.ticket}
                      </span>
                    </td>
                    <td className="doctor-queue-name">
                      <strong>{patient.name}</strong>
                      <small>Prontuário {patient.record}</small>
                    </td>
                    <td>{patient.age} anos</td>
                    <td>{patient.complaint}</td>
                    <td>
                      <PriorityBadge priority={patient.priority} />
                    </td>
                    <td className="doctor-queue-wait">
                      <Clock3 size={13} aria-hidden="true" />
                      <span>{patient.wait} min</span>
                    </td>
                    <td>{patient.nurse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

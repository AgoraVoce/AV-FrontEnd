import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
import {
  getWaitMinutes,
  sortPatientsByPriorityAndWait,
} from "../../reception/types";
import type { Priority, QueuePatient } from "../../reception/types";
import {
  callNextPatient,
  finalizeAppointment,
  getQueueSnapshot,
  subscribeQueue,
} from "../../reception/queue-store";
import { MedicalDischargeModal, type DischargeRecord } from "./MedicalDischargeModal";
import "./medico.css";
import "./medical-discharge.css";

const DOCTOR = {
  name: "Dr. Marcelo Arantes",
  crm: "CRM 142.890-SP",
  office: "Consultório 04",
  specialty: "Clínica Médica Geral",
};

const PRIORITY_CAPTION: Record<Priority, string> = {
  urgent: "Urgente (Vermelho)",
  alert: "Alerta (Amarelo)",
  calm: "Tranquilo (Verde)",
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

function PatientIdentity({ patient }: { patient: QueuePatient }) {
  return (
    <div className="doctor-patient-identity">
      <div>
        <h3>{patient.name}</h3>
        <p>
          {patient.age} anos
          {patient.gender && (
            <>
              {" "}
              <span aria-hidden="true">•</span> Sexo {patient.gender}
            </>
          )}
        </p>
      </div>
      <div className="doctor-ticket">
        <span className="doctor-label">SENHA</span>
        <strong>{patient.ticket}</strong>
      </div>
    </div>
  );
}

function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span className={`doctor-priority-pill is-${priority}`}>
      <span aria-hidden="true">●</span>
      {PRIORITY_CAPTION[priority]}
    </span>
  );
}

export default function MedicoPage() {
  usePageTitle("Consultório Médico");
  const queueSnapshot = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    getQueueSnapshot,
  );
  const [currentTime, setCurrentTime] = useState(getBrasiliaTime);
  const [queueNow, setQueueNow] = useState(() => Date.now());
  const [callError, setCallError] = useState("");
  const [dischargePatient, setDischargePatient] = useState<QueuePatient | null>(null);
  const [dischargeRevision, setDischargeRevision] = useState<number | null>(null);
  const [lastDischarge, setLastDischarge] = useState<{
    patient: QueuePatient;
    record: DischargeRecord;
    at: string;
  } | null>(null);
  const currentPatient =
    queueSnapshot.patients.find(
      (patient) => patient.ticket === queueSnapshot.activeConsultationTicket,
    ) ?? null;
  const waitingPatients = useMemo(
    () =>
      sortPatientsByPriorityAndWait(
        queueSnapshot.patients.filter(
          (patient) => patient.status === "waiting",
        ),
        queueNow,
      ),
    [queueSnapshot.patients, queueNow],
  );
  const nextPatient = waitingPatients[0] ?? null;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(getBrasiliaTime());
      setQueueNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Confirma a conclusão clínica antes de liberar o paciente da fila local.
  function handleFinishAppointment(record: DischargeRecord): boolean {
    if (!currentPatient || !dischargePatient || currentPatient.ticket !== dischargePatient.ticket || dischargeRevision === null) {
      setCallError("O paciente em atendimento mudou. Feche o formulário e confira a fila.");
      return false;
    }
    const result = finalizeAppointment(
      dischargePatient.ticket,
      "MEDICO",
      dischargeRevision,
    );
    if (!result.ok) {
      setCallError(
        result.reason === "stale"
          ? "A fila foi atualizada em outra tela. Feche o formulário, confira os dados e tente novamente."
          : "Não foi possível finalizar este atendimento.",
      );
      return false;
    }
    setLastDischarge({ patient: dischargePatient, record, at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) });
    setDischargePatient(null);
    setDischargeRevision(null);
    setCallError("");
    return true;
  }

  // Chama o próximo paciente da fila compartilhada, por prioridade e espera.
  function handleCallNextPatient() {
    if (currentPatient) {
      setCallError("Finalize o atendimento atual antes de chamar o próximo.");
      return;
    }
    if (!nextPatient) return;
    const result = callNextPatient(
      nextPatient.ticket,
      DOCTOR.office,
      DOCTOR.name,
      "MEDICO",
      queueSnapshot.revision,
    );
    if (!result.ok) {
      setCallError(
        result.reason === "stale"
          ? "A fila foi atualizada em outra tela. Confira o próximo paciente e tente novamente."
          : result.reason === "patient-not-next"
            ? "A ordem da fila mudou. Confira o próximo paciente e tente novamente."
            : result.reason === "consultation-active"
              ? "Finalize o atendimento atual antes de chamar o próximo."
              : "Não foi possível chamar o próximo paciente.",
      );
      return;
    }
    setCallError("");
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
              <span aria-label={currentPatient ? "Em atendimento" : "Disponível"} />
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
              <span aria-hidden="true">●</span> {currentPatient ? "Em atendimento" : "Disponível"}
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
                  <PriorityPill priority={currentPatient.priority} />
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
                      <strong
                        className={
                          currentPatient.vitals.temperature >= 38
                            ? "is-danger"
                            : undefined
                        }
                      >
                        {currentPatient.vitals.temperature.toFixed(1)} °C
                      </strong>
                    </div>
                    <div>
                      <span>Pressão Art.</span>
                      <strong>{currentPatient.vitals.bloodPressure}</strong>
                    </div>
                    <div>
                      <span>Escala de Dor</span>
                      <strong>
                        {currentPatient.vitals.painScale ?? "—"} / 10
                      </strong>
                    </div>
                  </div>
                </div>
                <button
                  className="doctor-action-button is-finish"
                  type="button"
                  onClick={() => {
                    if (!currentPatient) return;
                    setCallError("");
                    setDischargePatient(currentPatient);
                    setDischargeRevision(queueSnapshot.revision);
                  }}
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
                  <PriorityPill priority={nextPatient.priority} />
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
                  <strong>
                    Aguardando há {getWaitMinutes(nextPatient, queueNow)} min
                  </strong>
                </div>
                <button
                  className="doctor-action-button is-call"
                  type="button"
                  onClick={handleCallNextPatient}
                  disabled={Boolean(currentPatient)}
                >
                  <Megaphone size={15} aria-hidden="true" />
                  Chamar Próximo Paciente ({nextPatient.ticket})
                </button>
              </>
            ) : (
              <>
                <div className="doctor-empty-patient">
                  Não há próximo paciente para chamar.
                </div>
                <button
                  className="doctor-action-button is-call"
                  type="button"
                  disabled
                >
                  Fila vazia
                </button>
              </>
            )}
            {callError && (
              <p className="doctor-call-notice" role="status">
                {callError}
              </p>
            )}
          </section>
        </div>


        {lastDischarge && (
          <section className="doctor-discharge-receipt" aria-labelledby="doctor-discharge-receipt-title">
            <div className="doctor-discharge-receipt-header"><CheckCircle2 size={18} aria-hidden="true" /><h2 id="doctor-discharge-receipt-title">Atendimento finalizado nesta sessão</h2></div>
            <p><strong>{lastDischarge.patient.name}</strong> · Senha {lastDischarge.patient.ticket} · {lastDischarge.at}</p>
            <p><b>Resumo clínico:</b> <strong>{lastDischarge.record.summary}</strong></p>
            <p><b>Prescrição / conduta:</b> <strong>{lastDischarge.record.prescription}</strong></p>
            {lastDischarge.record.guidance && <p><b>Orientações:</b> <strong>{lastDischarge.record.guidance}</strong></p>}
            <p><b>Profissional:</b> {DOCTOR.name} · {DOCTOR.crm}</p>
            <p className="doctor-discharge-print-notice">Resumo demonstrativo, não assinado digitalmente e não persistido no servidor. Não substitui receita ou prontuário oficial.</p>
            <button type="button" onClick={() => window.print()}>Imprimir resumo demonstrativo</button>
          </section>
        )}

        <section className="doctor-queue-card">
          <div className="doctor-queue-heading">
            <div>
              <h2>Fila de Espera Geral</h2>
              <p>
                Pacientes na fila ordenados estritamente por urgência médica
              </p>
            </div>
            <span className="doctor-queue-total">
              Total na fila: <strong>{waitingPatients.length}</strong> pacientes
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
                {waitingPatients.map((patient) => (
                  <tr key={patient.ticket}>
                    <td>
                      <span className="doctor-queue-ticket">
                        {patient.ticket}
                      </span>
                    </td>
                    <td className="doctor-queue-name">
                      <strong>{patient.name}</strong>
                      <small>Prontuário {patient.record ?? "—"}</small>
                    </td>
                    <td>{patient.age} anos</td>
                    <td>{patient.complaint}</td>
                    <td>
                      <PriorityBadge priority={patient.priority} />
                    </td>
                    <td className="doctor-queue-wait">
                      <Clock3 size={13} aria-hidden="true" />
                      <span>{getWaitMinutes(patient, queueNow)} min</span>
                    </td>
                    <td>{patient.triagedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {dischargePatient && currentPatient?.ticket === dischargePatient.ticket && (
          <MedicalDischargeModal
            patient={dischargePatient}
            error={callError}
            onClose={() => { setDischargePatient(null); setDischargeRevision(null); setCallError(""); }}
            onConfirm={handleFinishAppointment}
          />
        )}
      </div>
    </AppShell>
  );
}

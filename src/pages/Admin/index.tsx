import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bed,
  BookOpenText,
  BriefcaseMedical,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  HeartPulse,
  List,
  ListChecks,
  ShieldCheck,
  Stethoscope,
  Timer,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { PriorityBadge } from "../../components/PriorityBadge";
import { usePageTitle } from "../../components/usePageTitle";
import { getQueueSnapshot, subscribeQueue } from "../../reception/queue-store";
import {
  getWaitMinutes,
  sortPatientsByPriorityAndWait,
} from "../../reception/types";
import type { Priority, QueuePatient } from "../../reception/types";
import { QueueSection, ReportsSection, UsersSection } from "./sections";
import { STAFF } from "./team-data";
import "./admin.css";
import "./admin-sections.css";

const REPORT_KPIS = {
  attendedToday: 86,
  dailyAverage: 77,
  averageWait: 23,
  urgentToday: 18,
};

const FLOW_POINTS = [
  { time: "08:00", intake: 20, finished: 12 },
  { time: "09:00", intake: 43, finished: 25 },
  { time: "10:00", intake: 68, finished: 49 },
  { time: "11:00", intake: 53, finished: 38 },
  { time: "12:00", intake: 91, finished: 65 },
  { time: "13:00", intake: 103, finished: 74 },
  { time: "14:00 (Pico)", intake: 76, finished: 59 },
  { time: "15:00", intake: 110, finished: 82 },
  { time: "16:00", intake: 86, finished: 67 },
  { time: "17:00", intake: 97, finished: 74 },
  { time: "18:00 (Agora)", intake: 71, finished: 54 },
];

const DASHBOARD_TABS = [
  { label: "Visão Geral", icon: Activity },
  { label: "Usuários", icon: Users },
  { label: "Fila de Espera", icon: ListChecks },
  { label: "Relatórios", icon: FileText },
];

function getBrasiliaTime() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function getQueueCounts(patients: QueuePatient[]) {
  return patients.reduce(
    (counts, patient) => {
      counts[patient.priority] += 1;
      return counts;
    },
    { urgent: 0, alert: 0, calm: 0 },
  );
}

function formatPriorityCount(priority: Priority, count: number) {
  const label: Record<Priority, [string, string]> = {
    urgent: ["Urgente", "Urgentes"],
    alert: ["Alerta", "Alertas"],
    calm: ["Tranquilo", "Tranquilos"],
  };
  return `${count} ${label[priority][count === 1 ? 0 : 1]}`;
}

function getChartPath(values: number[], closeToBottom = false) {
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 91 - (value / 120) * 73;
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  });
  if (closeToBottom) points.push("L 100 100 L 0 100 Z");
  return points.join(" ");
}

// Exporta os indicadores atuais em um arquivo CSV simples.
function exportDailyReport(rows: string[][]) {
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "relatorio-diario-pronto-socorro.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function QueueSummaryCard({ patient }: { patient: QueuePatient }) {
  return (
    <article className={`admin-queue-patient priority-${patient.priority}`}>
      <div className="admin-queue-patient-top">
        <div className="admin-queue-patient-identity">
          <span className="admin-ticket">{patient.ticket}</span>
          <strong>{patient.name}</strong>
        </div>
        <PriorityBadge priority={patient.priority} />
      </div>
      <div className="admin-queue-patient-details">
        <span>
          <Timer size={13} aria-hidden="true" />
          Aguardando há {getWaitMinutes(patient)} min
        </span>
        <span aria-hidden="true">•</span>
        <span className="admin-queue-complaint">{patient.complaint}</span>
      </div>
    </article>
  );
}

export default function AdminPage() {
  const queueSnapshot = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    getQueueSnapshot,
  );
  const [clock, setClock] = useState(getBrasiliaTime);
  const location = useLocation();
  const navigate = useNavigate();
  const selectedTab = location.pathname.endsWith("/usuarios")
    ? "Usuários"
    : location.pathname.endsWith("/fila")
      ? "Fila de Espera"
      : location.pathname.endsWith("/relatorios")
        ? "Relatórios"
        : "Visão Geral";
  const adminUrl = (section = "") => `/admin${section}${import.meta.env.DEV && new URLSearchParams(location.search).get("dev") === "admin" ? "?dev=admin" : ""}`;
  usePageTitle(selectedTab === "Visão Geral" ? "Painel Administrativo - Visão Geral do Pronto-Socorro" : `${selectedTab} | Administração`);
  const [now, setNow] = useState(() => Date.now());
  const waitingPatients = useMemo(
    () =>
      sortPatientsByPriorityAndWait(
        queueSnapshot.patients.filter(
          (patient) => patient.status === "waiting",
        ),
        now,
      ),
    [queueSnapshot.patients, now],
  );
  const activePatient =
    queueSnapshot.patients.find(
      (patient) => patient.ticket === queueSnapshot.activeConsultationTicket,
    ) ??
    queueSnapshot.patients.find((patient) => patient.status === "in-care") ??
    null;
  const queueCounts = getQueueCounts(waitingPatients);
  const queuePreview = [
    ...(activePatient ? [activePatient] : []),
    ...waitingPatients,
  ].slice(0, 4);
  const flowIntake = FLOW_POINTS.map((point) => point.intake);
  const flowFinished = FLOW_POINTS.map((point) => point.finished);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(getBrasiliaTime());
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const headerContext = (
    <span className="admin-header-clinic">
      <Building2 size={14} aria-hidden="true" />
      PRONTO-SOCORRO CENTRAL
    </span>
  );
  const headerTools = (
    <span className="admin-header-clock">
      <Clock3 size={14} aria-hidden="true" />
      <strong>{clock}</strong>
      <span>(Horário de Brasília)</span>
    </span>
  );

  const exportReport = () =>
    exportDailyReport([
      ["Indicador", "Valor"],
      ["Escopo", "Retrato da sessão local - dados simulados"],
      ["Gerado em", new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
      ["Pacientes em espera", String(waitingPatients.length)],
      ["Urgentes em espera", String(queueCounts.urgent)],
      ["Alertas em espera", String(queueCounts.alert)],
      ["Tranquilos em espera", String(queueCounts.calm)],
      ["Em atendimento", String(queueSnapshot.patients.filter((patient) => patient.status === "in-care" || patient.status === "called").length)],
      ["Finalizados nesta sessão", String(queueSnapshot.patients.filter((patient) => patient.status === "completed").length)],
      ["Eventos auditados na fila", String(queueSnapshot.auditEntries.length)],
    ]);

  return (
    <AppShell headerContext={headerContext} headerTools={headerTools}>
      <div className="admin-dashboard">
        <nav
          className="admin-tabs"
          aria-label="Seções do painel administrativo"
        >
          <div className="admin-tabs-list">
            {DASHBOARD_TABS.map(({ label, icon: Icon }) => (
              <button
                type="button"
                key={label}
                className={`admin-tab${selectedTab === label ? " is-active" : ""}`}
                aria-pressed={selectedTab === label}
                onClick={() => navigate(
                  label === "Usuários" ? adminUrl("/usuarios")
                    : label === "Fila de Espera" ? adminUrl("/fila")
                    : label === "Relatórios" ? adminUrl("/relatorios")
                    : adminUrl()
                )}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <div className="admin-sync-status">
            <span aria-hidden="true" />
            Sincronização local (demonstração)
          </div>
        </nav>

        {selectedTab === "Visão Geral" ? (
          <>
        <header className="admin-page-heading">
          <div>
            <p className="admin-eyebrow">
              <strong>CENTRO DE CONTROLE CLÍNICO</strong>
              <span aria-hidden="true">•</span>
              Pronto-Socorro Adulto
            </p>
            <h1>Painel Administrativo - Visão Geral do Pronto-Socorro</h1>
            <p className="admin-page-subtitle">
              Visão geral demonstrativa; indicadores históricos ilustrativos e fila local em tempo real
            </p>
          </div>
          <button
            className="admin-export-button"
            type="button"
            onClick={exportReport}
          >
            <ArrowDownToLine size={15} aria-hidden="true" />
            Exportar Relatório Diário
          </button>
        </header>

        <section className="admin-kpis" aria-label="Indicadores operacionais">
          <article className="admin-card admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">PACIENTES EM ESPERA</span>
              <span className="admin-kpi-icon">
                <Clock3 size={17} aria-hidden="true" />
              </span>
            </div>
            <p className="admin-kpi-value">
              {waitingPatients.length}
              <small>no momento</small>
            </p>
            <div className="admin-kpi-breakdown">
              <span className="is-urgent">
                ● {formatPriorityCount("urgent", queueCounts.urgent)}
              </span>
              <span className="is-alert">
                ● {formatPriorityCount("alert", queueCounts.alert)}
              </span>
              <span className="is-calm">
                ● {formatPriorityCount("calm", queueCounts.calm)}
              </span>
            </div>
          </article>

          <article className="admin-card admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">ATENDIDOS HOJE</span>
              <span className="admin-kpi-icon">
                <UserCheck size={17} aria-hidden="true" />
              </span>
            </div>
            <p className="admin-kpi-value">
              {REPORT_KPIS.attendedToday}
              <small>pacientes</small>
            </p>
            <p className="admin-kpi-note is-positive">
              <TrendingUp size={13} aria-hidden="true" />
              +12% vs. média diária ({REPORT_KPIS.dailyAverage})
            </p>
          </article>

          <article className="admin-card admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">TEMPO MÉDIO DE ESPERA</span>
              <span className="admin-kpi-icon">
                <Timer size={17} aria-hidden="true" />
              </span>
            </div>
            <p className="admin-kpi-value">
              {REPORT_KPIS.averageWait}
              <small>min</small>
            </p>
            <p className="admin-kpi-note">
              <CheckCircle2 size={13} aria-hidden="true" />
              Meta institucional: &lt; 30 min
            </p>
          </article>

          <article className="admin-card admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">CASOS URGENTES (HOJE)</span>
              <span className="admin-kpi-icon is-danger">
                <HeartPulse size={17} aria-hidden="true" />
              </span>
            </div>
            <p className="admin-kpi-value is-danger">
              {REPORT_KPIS.urgentToday}
              <small>atendimentos</small>
            </p>
            <p className="admin-kpi-note">
              <CheckCircle2 size={13} aria-hidden="true" />
              100% no protocolo &lt; 15 min
            </p>
          </article>
        </section>

        <section className="admin-operations-grid">
          <article className="admin-card admin-flow-card">
            <div className="admin-section-heading admin-flow-heading">
              <div>
                <h2>Curva de Fluxo de Atendimento</h2>
                <p>
                  Entrada de fichas vs. Liberações médicas por faixa de horário
                  (Hoje)
                </p>
              </div>
              <div className="admin-chart-legend">
                <span className="is-intake">Entrada Triagem</span>
                <span className="is-finished">Atendimento Finalizado</span>
              </div>
            </div>
            <div
              className="admin-chart"
              role="img"
              aria-label="Gráfico de entrada de triagem e atendimentos finalizados durante o dia"
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="intake-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#007b78" stopOpacity=".16" />
                    <stop offset="100%" stopColor="#007b78" stopOpacity=".02" />
                  </linearGradient>
                  <linearGradient
                    id="finished-fill"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#63d0c4" stopOpacity=".14" />
                    <stop offset="100%" stopColor="#63d0c4" stopOpacity=".01" />
                  </linearGradient>
                </defs>
                {[20, 43, 66, 89].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    x2="100"
                    y1={y}
                    y2={y}
                    className="admin-chart-gridline"
                  />
                ))}
                <path
                  d={getChartPath(flowFinished, true)}
                  className="admin-chart-area-finished"
                />
                <path
                  d={getChartPath(flowIntake, true)}
                  className="admin-chart-area-intake"
                />
                <path
                  d={getChartPath(flowFinished)}
                  className="admin-chart-line-finished"
                />
                <path
                  d={getChartPath(flowIntake)}
                  className="admin-chart-line-intake"
                />
                <circle
                  cx="100"
                  cy={91 - (FLOW_POINTS.at(-1)!.intake / 120) * 73}
                  r="1.5"
                  className="admin-chart-current-point"
                />
              </svg>
            </div>
            <div className="admin-chart-axis">
              {[
                "08:00",
                "10:00",
                "12:00",
                "14:00 (Pico)",
                "16:00",
                "18:00 (Agora)",
              ].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </article>

          <article className="admin-card admin-capacity-card">
            <div className="admin-section-heading admin-capacity-heading">
              <h2>Capacidade dos Postos</h2>
              <span className="admin-operational-pill">● 92% Operacional</span>
            </div>
            <p className="admin-card-subtitle">
              Status de ocupação imediata das salas ativas
            </p>
            <div className="admin-capacity-list">
              <div className="admin-capacity-row">
                <Stethoscope size={16} aria-hidden="true" />
                <strong>Consultórios Médicos</strong>
                <span className="admin-capacity-value">
                  4 de 4 em atendimento
                </span>
              </div>
              <div className="admin-capacity-row">
                <BriefcaseMedical size={16} aria-hidden="true" />
                <strong>Postos de Triagem</strong>
                <span className="admin-capacity-value">2 de 2 operando</span>
              </div>
              <div className="admin-capacity-row">
                <Bed size={16} aria-hidden="true" />
                <strong>Leitos de Observação</strong>
                <span className="admin-capacity-value">6 de 8 ocupados</span>
              </div>
            </div>
            <p className="admin-capacity-foot">
              Próxima troca de turno <strong>19:00 (Equipe Noturna)</strong>
            </p>
          </article>
        </section>

        <section className="admin-management-grid">
          <article className="admin-card admin-staff-card">
            <div className="admin-section-heading admin-staff-heading">
              <div className="admin-section-title-with-icon">
                <Users size={18} aria-hidden="true" />
                <div>
                  <h2>Gestão de Usuários e Equipe</h2>
                  <p>Colaboradores ativos alocados nas salas e guichês</p>
                </div>
              </div>
              <button className="admin-add-button" type="button" onClick={() => navigate(adminUrl("/usuarios"))}>
                + Adicionar Usuário
              </button>
            </div>
            <div className="admin-staff-table-wrap">
              <table className="admin-staff-table">
                <thead>
                  <tr>
                    <th>PROFISSIONAL</th>
                    <th>FUNÇÃO / ESPECIALIDADE</th>
                    <th>LOCAL</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {STAFF.map(
                    ({
                      initials,
                      name,
                      registration,
                      role,
                      location,
                      status,
                      icon: Icon,
                    }) => (
                      <tr key={registration}>
                        <td>
                          <div className="admin-staff-person">
                            <span className="admin-staff-avatar">
                              {initials}
                            </span>
                            <span>
                              <strong>{name}</strong>
                              <small>{registration}</small>
                            </span>
                          </div>
                        </td>
                        <td>{role}</td>
                        <td>
                          <span className="admin-location-pill">
                            <Icon size={12} aria-hidden="true" />
                            {location}
                          </span>
                        </td>
                        <td>
                          <span className="admin-staff-status">
                            <span aria-hidden="true" />
                            {status}
                          </span>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <footer className="admin-staff-footer">
              <span>Mostrando {STAFF.length} profissionais demonstrativos</span>
              <button type="button" className="admin-inline-action" onClick={() => navigate(adminUrl("/usuarios"))}>
                <BookOpenText size={13} aria-hidden="true" />
                Ver equipe completa <ArrowRight size={13} aria-hidden="true" />
              </button>
            </footer>
          </article>

          <article className="admin-card admin-queue-card">
            <div className="admin-section-heading admin-queue-heading">
              <div className="admin-section-title-with-icon">
                <List size={18} aria-hidden="true" />
                <h2>Visão Resumida da Fila Ativa</h2>
              </div>
              <Link
                className="admin-inline-action"
                to={adminUrl("/fila")}
              >
                Painel Geral <ExternalLink size={13} aria-hidden="true" />
              </Link>
            </div>
            <p className="admin-card-subtitle">
              Fila Ativa por Nível de Prioridade
            </p>
            <div className="admin-queue-list">
              {queuePreview.length ? (
                queuePreview.map((patient) => (
                  <QueueSummaryCard key={patient.ticket} patient={patient} />
                ))
              ) : (
                <p className="admin-empty-queue">
                  Não há pacientes aguardando no momento.
                </p>
              )}
            </div>
            <footer className="admin-queue-footer">
              <span>
                <span className="admin-queue-footer-dot" aria-hidden="true" />
                Ordem calculada pelo Protocolo de Triagem
              </span>
              <Link className="admin-call-next" to={adminUrl("/fila")}>
                Ver fila completa <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </footer>
          </article>
        </section>

        <section className="admin-card admin-audit-card">
          <span className="admin-audit-icon">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <div className="admin-audit-copy">
            <h2>Auditoria e Conformidade Sanitária</h2>
            <p>
              Demonstração local: registros clínicos e eventos de fila ainda não
              possuem assinatura digital nem persistência em servidor.
            </p>
          </div>
          <p className="admin-backup">
            Último backup: <strong>Hoje, 14:00</strong>
          </p>
          <button className="admin-logs-button" type="button" onClick={() => navigate(adminUrl("/relatorios"))}>
            Ver Logs do Sistema
          </button>
        </section>
          </>
        ) : selectedTab === "Usuários" ? (
          <UsersSection initialUsers={STAFF} actorRole="ADMIN" />
        ) : selectedTab === "Fila de Espera" ? (
          <QueueSection patients={queueSnapshot.patients} now={now} />
        ) : (
          <ReportsSection patients={queueSnapshot.patients} now={now} auditCount={queueSnapshot.auditEntries.length} onExport={exportReport} />
        )}
      </div>
    </AppShell>
  );
}

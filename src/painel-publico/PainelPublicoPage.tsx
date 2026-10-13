import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import {
  getQueueSnapshot,
  subscribeQueue,
  type QueueCall,
} from "../reception/queue-store";
import { sortPatientsByPriorityAndWait } from "../reception/types";
import type { Priority, QueuePatient } from "../reception/types";
import { BannerOrientacao } from "./components/BannerOrientacao";
import { ChamadaPrincipal } from "./components/ChamadaPrincipal";
import { HeaderPainel } from "./components/HeaderPainel";
import { ProximosChamados } from "./components/ProximosChamados";
import type { Chamada, Prioridade } from "./types";
import "./styles/painel-publico.css";

const PRIORITY_LABEL: Record<Priority, Prioridade> = {
  urgent: "URGENTE",
  alert: "ALERTA",
  calm: "TRANQUILO",
};

function toPublicCall(call: QueueCall | QueuePatient): Chamada {
  return {
    senha: call.ticket,
    nome: call.name,
    prioridade: PRIORITY_LABEL[call.priority],
    status: "CHAMANDO",
    ...("destination" in call ? { destino: call.destination } : {}),
    ...("physician" in call ? { medicoResponsavel: call.physician } : {}),
    ...("calledAt" in call ? { calledAt: call.calledAt } : {}),
  };
}

export function PainelPublicoPage({
  presentation = "admin",
}: {
  presentation?: "admin" | "tv";
}) {
  const isTvMode = presentation === "tv";
  usePageTitle(
    isTvMode
      ? "Transmissão TV | Agora Você"
      : "Painel Público de Chamada Hospitalar",
  );
  const queueSnapshot = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    getQueueSnapshot,
  );
  const { patients: allPatients } = queueSnapshot;
  const patients = allPatients.filter(
    (patient) => patient.status === "waiting",
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const orderedPatients = useMemo(
    () => sortPatientsByPriorityAndWait(patients, now),
    [patients, now],
  );

  const activeCall =
    queueSnapshot.currentCall ??
    allPatients.find((patient) => patient.status === "called") ??
    allPatients.find(
      (patient) =>
        patient.ticket === queueSnapshot.activeConsultationTicket ||
        patient.status === "in-care",
    ) ??
    null;
  const nextCalls: Chamada[] = orderedPatients.slice(0, 5).map((patient) => ({
    senha: patient.ticket,
    nome: patient.name,
    prioridade: PRIORITY_LABEL[patient.priority],
    status: "AGUARDANDO",
  }));
  const currentCall: Chamada | null = activeCall
    ? toPublicCall(activeCall)
    : null;

  const content = (
    <div className={`painel-publico${isTvMode ? " is-tv-mode" : ""}`}>
      <HeaderPainel
        presentation={presentation}
        developmentMode={import.meta.env.DEV}
      />
      <ChamadaPrincipal chamada={currentCall} waitingCount={patients.length} />
      <ProximosChamados chamadas={nextCalls} />
      <BannerOrientacao />
    </div>
  );

  return isTvMode ? (
    <main className="painel-tv-root">{content}</main>
  ) : (
    <AppShell>{content}</AppShell>
  );
}

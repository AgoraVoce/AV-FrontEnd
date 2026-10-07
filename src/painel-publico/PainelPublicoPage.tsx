import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { getQueueSnapshot, subscribeQueue } from "../reception/queue-store";
import { QUEUE_MOCK } from "../reception/queue-data";
import { getWaitMinutes } from "../reception/types";
import type { Priority } from "../reception/types";
import { BannerOrientacao } from "./components/BannerOrientacao";
import { ChamadaPrincipal } from "./components/ChamadaPrincipal";
import { HeaderPainel } from "./components/HeaderPainel";
import { ProximosChamados } from "./components/ProximosChamados";
import type { Chamada, Prioridade } from "./types";
import "./styles/painel-publico.css";

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  alert: 1,
  calm: 2,
};

const PRIORITY_LABEL: Record<Priority, Prioridade> = {
  urgent: "URGENTE",
  alert: "ALERTA",
  calm: "TRANQUILO",
};

export function PainelPublicoPage() {
  usePageTitle("Painel Público de Chamada Hospitalar");
  const { patients: allPatients } = useSyncExternalStore(subscribeQueue, getQueueSnapshot, getQueueSnapshot);
  const patients = allPatients.filter((patient) => patient.status === "waiting");
  const [now, setNow] = useState(() => Date.parse(QUEUE_MOCK[0].arrivedAt) + QUEUE_MOCK[0].waitMinutes * 60_000);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const orderedPatients = useMemo(() => [...patients].sort(
    (left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] || getWaitMinutes(right, now) - getWaitMinutes(left, now),
  ), [patients, now]);

  const activeCall = orderedPatients.find((patient) => patient.ticket === "U-038") ?? orderedPatients[0] ?? null;
  const nextCalls: Chamada[] = orderedPatients
    .filter((patient) => patient.ticket !== activeCall?.ticket)
    .slice(0, 5)
    .map((patient, index) => ({
      senha: patient.ticket,
      nome: patient.name,
      prioridade: PRIORITY_LABEL[patient.priority],
      status: "AGUARDANDO",
      previsaoMinutos: (index + 1) * 5,
    }));
  const currentCall: Chamada | null = activeCall ? {
    senha: activeCall.ticket,
    nome: activeCall.name,
    prioridade: PRIORITY_LABEL[activeCall.priority],
    status: "CHAMANDO",
    destino: "CONSULTÓRIO 03",
    medicoResponsavel: "Dra. Helena Martins",
  } : null;

  return (
    <AppShell>
      <div className="painel-publico">
      <HeaderPainel />
      <ChamadaPrincipal chamada={currentCall} />
      <ProximosChamados chamadas={nextCalls} />
      <BannerOrientacao />
      </div>
    </AppShell>
  );
}

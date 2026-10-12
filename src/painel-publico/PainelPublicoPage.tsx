import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { getQueueSnapshot, subscribeQueue } from "../reception/queue-store";
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
  const { patients: allPatients } = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    getQueueSnapshot,
  );
  const patients = allPatients.filter(
    (patient) => patient.status === "waiting",
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const orderedPatients = useMemo(
    () =>
      [...patients].sort(
        (left, right) =>
          PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
          getWaitMinutes(right, now) - getWaitMinutes(left, now),
      ),
    [patients, now],
  );

  const activeCall =
    allPatients.find((patient) => patient.status === "called") ?? null;
  const nextCalls: Chamada[] = orderedPatients.slice(0, 5).map((patient) => ({
    senha: patient.ticket,
    nome: patient.name,
    prioridade: PRIORITY_LABEL[patient.priority],
    status: "AGUARDANDO",
  }));
  const currentCall: Chamada | null = activeCall
    ? {
        senha: activeCall.ticket,
        nome: activeCall.name,
        prioridade: PRIORITY_LABEL[activeCall.priority],
        status: "CHAMANDO",
      }
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

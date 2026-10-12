import type { QueuePatient } from "./types";

const patient = (data: Omit<QueuePatient, "arrivedAt" | "status">): QueuePatient => ({
  ...data,
  arrivedAt: new Date(Date.now() - data.waitMinutes * 60_000).toISOString(),
  status: "waiting",
});

export const QUEUE_MOCK: QueuePatient[] = [
  patient({
    ticket: "U-038",
    name: "Maria Clara Santos",
    age: 58,
    complaint: "Dor torácica súbita irradiando para MSE",
    priority: "urgent",
    waitMinutes: 8,
    vitals: { bloodPressure: "140/90", heartRate: 98, oxygenSaturation: 97, temperature: 37.2 },
  }),
  patient({
    ticket: "U-039",
    name: "Roberto Souza Lima",
    age: 67,
    complaint: "Dispneia moderada e tosse produtiva",
    priority: "urgent",
    waitMinutes: 14,
    vitals: { bloodPressure: "150/95", heartRate: 112, oxygenSaturation: 92, temperature: 38.1 },
  }),
  patient({
    ticket: "A-051",
    name: "Ana Beatriz Rocha",
    age: 34,
    complaint: "Cólica renal intensa com episódios eméticos",
    priority: "alert",
    waitMinutes: 22,
    vitals: { bloodPressure: "140/90", heartRate: 98, oxygenSaturation: 97, temperature: 37.2 },
  }),
  patient({
    ticket: "A-052",
    name: "Jorge Fernando Alves",
    age: 45,
    complaint: "Queda de mesmo nível, suspeita de fratura em punho D",
    priority: "alert",
    waitMinutes: 31,
    vitals: { bloodPressure: "130/85", heartRate: 88, oxygenSaturation: 98, temperature: 36.8 },
  }),
  patient({
    ticket: "T-089",
    name: "Juliana Mendes",
    age: 29,
    complaint: "Sintomas gripais há 3 dias, febre afebril 38°C",
    priority: "calm",
    waitMinutes: 45,
    vitals: { bloodPressure: "120/80", heartRate: 84, oxygenSaturation: 98, temperature: 37.8 },
  }),
  patient({
    ticket: "T-090",
    name: "Lucas Gabriel Moreira",
    age: 19,
    complaint: "Escoriação superficial no joelho direito por abrasão",
    priority: "calm",
    waitMinutes: 50,
    vitals: { bloodPressure: "118/76", heartRate: 76, oxygenSaturation: 99, temperature: 36.6 },
  }),
];

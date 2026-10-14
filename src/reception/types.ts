export type Priority = "urgent" | "alert" | "calm";

export interface PatientVitals {
  bloodPressure: string;
  heartRate: number;
  oxygenSaturation: number;
  temperature: number;
  painScale?: number;
}

export interface QueuePatient {
  ticket: string;
  name: string;
  gender?: string;
  record?: string;
  triagedBy?: string;
  cpf?: string;
  age: number;
  complaint: string;
  priority: Priority;
  waitMinutes: number;
  arrivedAt: string;
  status: "waiting" | "called" | "in-care" | "completed" | "deleted";
  vitals: PatientVitals;
}

export const getWaitMinutes = (patient: QueuePatient, now = Date.now()) =>
  Math.max(0, Math.floor((now - Date.parse(patient.arrivedAt)) / 60_000));

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  alert: 1,
  calm: 2,
};

export const sortPatientsByPriorityAndWait = (
  patients: QueuePatient[],
  now = Date.now(),
) =>
  [...patients].sort(
    (left, right) =>
      PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
      getWaitMinutes(right, now) - getWaitMinutes(left, now),
  );

export type Priority = "urgent" | "alert" | "calm";

export interface PatientVitals {
  bloodPressure: string;
  heartRate: number;
  oxygenSaturation: number;
  temperature: number;
}

export interface QueuePatient {
  ticket: string;
  name: string;
  age: number;
  complaint: string;
  priority: Priority;
  waitMinutes: number;
  arrivedAt: string;
  status: "waiting" | "called" | "in-care" | "deleted";
  vitals: PatientVitals;
}

export const getWaitMinutes = (patient: QueuePatient, now = Date.now()) =>
  Math.max(0, Math.floor((now - Date.parse(patient.arrivedAt)) / 60_000));

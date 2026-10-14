import { Activity, Building2, DoorOpen } from "lucide-react";

export const STAFF = [
  {
    initials: "MA",
    name: "Dr. Marcelo Arantes",
    registration: "CRM/SP 148.920",
    role: "Médico / Clínica Geral",
    location: "Consultório 04",
    status: "Em atendimento",
    icon: DoorOpen,
  },
  {
    initials: "HM",
    name: "Dra. Helena Martins",
    registration: "CRM/SP 204.118",
    role: "Médica / Cardiologia",
    location: "Consultório 03",
    status: "Em atendimento",
    icon: DoorOpen,
  },
  {
    initials: "CB",
    name: "Camila Barreto",
    registration: "COREN/SP 432.890",
    role: "Recepcionista / Triagem — Classificação Manchester",
    location: "Recepção 01",
    status: "Ativa",
    icon: Activity,
  },
  {
    initials: "LV",
    name: "Lucas Vasconcelos",
    registration: "Matrícula ADM-891",
    role: "Administrador / Gestão Hospitalar",
    location: "Coordenação",
    status: "Ativo",
    icon: Building2,
  },
];


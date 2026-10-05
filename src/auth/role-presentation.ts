import type { Role } from "./types";
export const PRESENTATION: Record<
  Role,
  {
    label: string;
    headline: string[];
    accent: string;
    description: string;
    loginHelp: string;
  }
> = {
  RECEPCIONISTA: {
    label: "Recepção",
    headline: ["O cuidado começa", "com uma boa"],
    accent: "recepção.",
    description:
      "Organize o acesso. Conecte a equipe.\nMantenha o atendimento em movimento.",
    loginHelp: "Use o identificador fornecido pela administração.",
  },
  MEDICO: {
    label: "Médico",
    headline: ["Sua equipe conectada.", "Seu foco no"],
    accent: "atendimento.",
    description:
      "Acesse sua área com clareza.\nContinue de onde a equipe precisa de você.",
    loginHelp: "Use o identificador fornecido pela administração.",
  },
  ADMIN: {
    label: "Admin",
    headline: ["Uma equipe alinhada.", "Um acesso bem"],
    accent: "organizado.",
    description:
      "Conecte a operação com segurança.\nAcesse sua área de administração.",
    loginHelp: "Use o identificador fornecido pela administração.",
  },
};

export type Specialty = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  doctorCount: number;
};
export type Room = {
  id: string;
  name: string;
  type: string;
  status: "ativa" | "manutencao" | "inativa";
};
export type Professional = {
  id: string;
  name: string;
  userId: string;
  user: { email: string };
  crmNumber: string | null;
  crmUf: string | null;
  phone: string | null;
  specialtyId: string;
  specialty: Specialty;
  defaultRoomId: string | null;
  defaultRoom: Room | null;
  active: boolean;
};
export type ProfessionalInput = {
  name: string;
  email: string;
  crmNumber: string;
  crmUf: string;
  phone: string | null;
  specialtyId: string;
  defaultRoomId: string | null;
  active: boolean;
  password?: string;
};
export type Shift = {
  id: string;
  doctorId: string;
  roomId: string | null;
  room: string | null;
  startsAt: string;
  endsAt: string;
  availabilityStatus: "DISPONIVEL" | "INDISPONIVEL";
  recurrenceId: string | null;
  doctor?: { id: string; name: string; specialtyId: string };
};
export type ShiftInput = Pick<
  Shift,
  "startsAt" | "endsAt" | "roomId" | "availabilityStatus"
>;
export type OwnProfile = Professional & { nextShift: Shift | null };

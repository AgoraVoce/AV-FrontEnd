import type { Page } from "@playwright/test";

export type VisualRole = "RECEPCIONISTA" | "MEDICO" | "ADMIN";
export const visualAccount = { email: "revisao-visual@exemplo.test", password: "senha-ficticia-apenas-teste" };
export const entryId = "88888888-8888-4888-8888-888888888888";
export const patientId = "77777777-7777-4777-8777-777777777777";
export const doctorId = "66666666-6666-4666-8666-666666666666";
const secondEntryId = "88888888-8888-4888-8888-888888888889";

const NOW = "2026-10-19T15:00:00.000Z";
const doctor = {
  id: doctorId,
  name: "Dra. Helena Exemplo",
  specialty: { id: "55555555-5555-4555-8555-555555555555", name: "Clínica Médica" },
  shift: { id: "44444444-4444-4444-8444-444444444444", startsAt: "2026-10-19T08:00:00Z", endsAt: "2026-10-19T22:00:00Z", room: "Consultório 02" },
};

export async function installApiFixtures(page: Page, role: VisualRole) {
  let entryStatus: "waiting" | "called" | "in_progress" | "completed" = "waiting";
  let currentTicket: Record<string, unknown> | null = null;
  const unexpected: string[] = [];
  const user = {
    id: "99999999-9999-4999-8999-999999999999",
    name: role === "MEDICO" ? "Dra. Helena Exemplo" : role === "ADMIN" ? "Administração Exemplo" : "Recepção Exemplo",
    email: visualAccount.email,
    role,
  };
  const patient = {
    id: patientId,
    fullName: "Paciente de Demonstração",
    cpf: "00000000000",
    birthDate: "1997-02-10",
    email: null,
    phone: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const detail = () => ({
    id: entryId,
    patientId,
    enteredAt: NOW,
    severity: "AMARELO",
    status: entryStatus,
    assignedDoctorId: doctorId,
    queueCode: "A-012",
    otherSymptoms: "Dor de cabeça e tontura",
    shortNote: "Sintomas relatados na chegada.",
    queuePosition: entryStatus === "waiting" ? 1 : null,
    patient: { id: patientId, fullName: patient.fullName, birthDate: patient.birthDate },
    doctor: { id: doctorId, name: doctor.name },
    room: doctor.shift.room,
    timestamps: {
      enteredAt: NOW,
      calledAt: entryStatus === "waiting" ? null : NOW,
      startedAt: entryStatus === "in_progress" || entryStatus === "completed" ? NOW : null,
      finishedAt: entryStatus === "completed" ? NOW : null,
    },
    prescription: entryStatus === "completed" ? {
      description: "Conduta médica de demonstração.",
      medications: [{ name: "Medicamento fictício", dosage: "1 unidade", instructions: "Seguir orientação da equipe" }],
    } : null,
  });

  await page.route("**/api/v1/**", async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === "/auth/login" && method === "POST") {
      return json({ accessToken: "token-ficticio-local", tokenType: "Bearer", expiresIn: 900, user });
    }
    if (path === "/auth/me" && method === "GET") return json(user);
    if (path === "/auth/logout" && method === "POST") return route.fulfill({ status: 204, body: "" });

    if (path === "/queues/waiting" && method === "GET") {
      return json({ items: [
        { entryId, fullName: patient.fullName, queueCode: "A-012" },
        { entryId: secondEntryId, fullName: "Outra Pessoa Fictícia", queueCode: "V-019" },
      ] });
    }
    if (path === "/queues/me" && method === "GET") {
      return json({ items: [
        {
          entryId, patientId, fullName: patient.fullName, queueCode: "A-012",
          severity: "AMARELO", enteredAt: NOW,
          symptoms: [{ id: "sintoma-teste", name: "Dor de cabeça" }],
          otherSymptoms: "Tontura", shortNote: "Paciente orientado.",
        },
        {
          entryId: secondEntryId, patientId: "77777777-7777-4777-8777-777777777778",
          fullName: "Outra Pessoa Fictícia", queueCode: "V-019",
          severity: "VERDE", enteredAt: "2026-10-19T15:15:00.000Z",
          symptoms: [], otherSymptoms: "Mal-estar", shortNote: null,
        },
      ] });
    }
    if (path === "/queues/me/next" && method === "POST") {
      entryStatus = "called";
      return json(detail());
    }

    if (path === "/patients" && method === "GET") {
      return json({ items: [patient], page: 1, pageSize: Number(url.searchParams.get("pageSize") || "10"), total: 1 });
    }
    if (path === "/patients/" + patientId && method === "GET") return json(patient);
    if (path === "/doctors" && method === "GET") {
      return json({ items: [doctor], page: 1, pageSize: Number(url.searchParams.get("pageSize") || "100"), total: 1 });
    }
    if (path === "/employees" && method === "GET") {
      return json({
        items: [
          { id: "e-1", name: "Dra. Helena Exemplo", email: "medica@exemplo.test", role: "MEDICO", active: true, createdAt: NOW, updatedAt: NOW },
          { id: "e-2", name: "Recepção Exemplo", email: "recepcao@exemplo.test", role: "RECEPCIONISTA", active: true, createdAt: NOW, updatedAt: NOW },
          { id: "e-3", name: "Administração Exemplo", email: "admin@exemplo.test", role: "ADMIN", active: true, createdAt: NOW, updatedAt: NOW },
        ],
        page: 1, pageSize: 10, total: 3,
      });
    }
    if (path === "/admin/dashboard" && method === "GET") {
      return json({ date: "2026-10-19", timezone: "America/Sao_Paulo",
        waiting: 2, called: 1, inProgress: 1, completedToday: 3, cancelledToday: 0 });
    }
    if (path === "/doctors/me/profile" && method === "GET") {
      return json({ ...doctor, user, specialtyId: doctor.specialty.id,
        crmNumber: "12345", crmUf: "SP", phone: "11999999999",
        defaultRoomId: null, defaultRoom: null,
        nextShift: { ...doctor.shift, doctorId, availabilityStatus: "DISPONIVEL" } });
    }
    if ((path === "/entries/" + entryId + "/reassessments" ||
      path === "/entries/" + secondEntryId + "/reassessments") && method === "GET") {
      return json({ items: [], total: 0, page: 1, pageSize: 20 });
    }
    if (path === "/entries/" + secondEntryId && method === "GET") {
      return json({ ...detail(), id: secondEntryId,
        patient: { ...detail().patient, fullName: "Outra Pessoa Fictícia" },
        otherSymptoms: "Mal-estar", severity: "VERDE", queueCode: "V-019" });
    }
    if (path === "/entries/" + entryId && method === "GET") return json(detail());
    if (path === "/entries/" + entryId + "/doctor" && method === "PATCH") return json({ id: entryId, status: "AGUARDANDO" });
    if (path === "/entries/" + entryId + "/status" && method === "PATCH") {
      const body = route.request().postDataJSON() as { status: string };
      entryStatus = body.status === "in_progress" ? "in_progress" : "completed";
      return json(detail());
    }
    if (path === "/entries/" + entryId + "/complete" && method === "POST") {
      entryStatus = "completed";
      return json(detail());
    }
    if (path === "/public/calls" && method === "GET") {
      return json({ items: [{ queueCode: "A-012", room: "Consultório 02", calledAt: NOW }] });
    }
    if (path === "/doctors/me/dashboard" && method === "GET") {
      return json({ date: "2026-10-19", waiting: 2, called: 0, inProgress: 0, completedToday: 3, cancelledToday: 0 });
    }
    if (path === "/doctors/me/active" && method === "GET") return json(entryStatus === "waiting" || entryStatus === "completed" ? null : detail());
    const historyEntry = { id: entryId, patientId, enteredAt: NOW, status: "FINALIZADO",
      severity: "AMARELO", queueCode: "A-012", patient: { id: patientId, fullName: patient.fullName },
      doctor: { id: doctorId, name: doctor.name },
      attendance: { room: "Consultório 02", calledAt: NOW, startedAt: NOW, finishedAt: NOW } };
    if ((path === "/entries" || path === "/doctors/me/entries" || path === "/patients/" + patientId + "/entries") && method === "GET") {
      return json({ items: [historyEntry], total: 1, page: Number(url.searchParams.get("page") || 1), pageSize: 10 });
    }
    if (path === "/patients/" + patientId && method === "PATCH") return json({ ...patient, ...route.request().postDataJSON() });
    if (path.startsWith("/employees/") && method === "PATCH") return json({ ...user, ...route.request().postDataJSON() });
    if (path === "/admin/reports" && method === "GET") {
      return json({ period: { dateFrom: url.searchParams.get("dateFrom"), dateTo: url.searchParams.get("dateTo"), timezone: "America/Sao_Paulo" },
        summary: { totalEntries: 3, waiting: 0, called: 0, inProgress: 0, completed: 2, cancelled: 1, averageWaitSeconds: 720, measuredWaits: 2 },
        bySeverity: [{ severity: "AMARELO", count: 3 }],
        doctors: [{ doctorId, name: doctor.name, completed: 2, averageAttendanceSeconds: 900 }] });
    }
    const room = { id: "33333333-3333-4333-8333-333333333333", name: "Consultório 02", type: "Consultório", status: "ativa" };
    const profile = { id: doctorId, userId: user.id, name: doctor.name, active: true, specialtyId: doctor.specialty.id, specialty: { ...doctor.specialty, active: true }, user: { email: "medica@exemplo.test" }, crmNumber: "12345", crmUf: "SP", phone: "11999999999", defaultRoomId: room.id, defaultRoom: room };
    if (path === "/rooms" && method === "GET") return json({ items: [room] });
    if (path === "/admin/shifts" && method === "GET") return json({ items: [{ ...doctor.shift, doctorId, doctor: { id: doctorId, name: doctor.name, specialtyId: profile.specialtyId }, roomId: room.id, availabilityStatus: "DISPONIVEL", recurrenceId: null }], total: 1, page: 1, pageSize: Number(url.searchParams.get("pageSize") || 100) });
    if (path === "/admin/doctors" && method === "GET") return json({ items: [profile], total: 1, page: 1, pageSize: Number(url.searchParams.get("pageSize") || 10) });
    if (path === "/specialties" && method === "GET") return json({ items: [profile.specialty], total: 1, page: 1, pageSize: Number(url.searchParams.get("pageSize") || 20) });
    if (path === "/doctors" && method === "POST") return json(profile, 201);
    if (path === "/doctors/" + doctorId && method === "GET") return json(profile);
    if (path === "/doctors/" + doctorId && method === "PATCH") return json({ ...profile, ...route.request().postDataJSON() });
    if (path === "/doctors/" + doctorId + "/shifts" && method === "GET") return json({ items: [{ ...doctor.shift, doctorId, availabilityStatus: "DISPONIVEL" }], total: 1, page: 1, pageSize: 100 });
    if (path === "/doctors/" + doctorId + "/shifts" && method === "POST") return json({ ...doctor.shift, ...route.request().postDataJSON() }, 201);
    if (path === "/tickets/waiting" && method === "GET") return json({ items: [] });
    if (path === "/tickets/current" && method === "GET") return json(currentTicket);
    if (path === "/tickets" && method === "POST") return json({ id: "22222222-2222-4222-8222-222222222222", codigo: "N001", tipo: "normal", status: "aguardando", horarioEmissao: NOW, horarioChamada: null, horarioFinalizacao: null, entryId: null, nomePaciente: null }, 201);
    if (path === "/tickets/call-next" && method === "POST") return route.fulfill({ status: 204, body: "" });
    if (path === "/tickets/22222222-2222-4222-8222-222222222222/recall" && method === "POST") return json(currentTicket);
    if (path.endsWith("/status") && path.startsWith("/tickets/") && method === "PATCH") { currentTicket = null; return json({ status: "finalizada" }); }
    if (path === "/auth/password-reset/request" && method === "POST") return json({ message: "Verifique seu e-mail" }, 202);
    if (path === "/auth/password-reset/confirm" && method === "POST") return route.fulfill({ status: 204, body: "" });
    if (path === "/entries/" + entryId + "/prescription.pdf" && method === "GET") return route.fulfill({ status: 200, headers: { "Content-Type": "application/pdf" }, body: "%PDF-1.4\\n%%EOF" });
    unexpected.push(method + " " + path);
    return json({ error: { code: "VISUAL_FIXTURE_NOT_FOUND", message: "Mock visual não configurado" } }, 404);
  });
  return { unexpected };
}

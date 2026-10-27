import { expect, test, type Page } from "@playwright/test";

// Contract-oriented regression tests for the endpoints implemented by AV-Backend.
// All data is synthetic. Requests never reach production.
const userId = "11111111-1111-4111-8111-111111111111";
const doctorId = "22222222-2222-4222-8222-222222222222";
const specialtyId = "33333333-3333-4333-8333-333333333333";
const patientId = "44444444-4444-4444-8444-444444444444";
const entryId = "55555555-5555-4555-8555-555555555555";
const shiftId = "66666666-6666-4666-8666-666666666666";
const ticketId = "77777777-7777-4777-8777-777777777777";
const ts = "2026-10-19T15:00:00.000Z";

const doctor = { id: doctorId, userId, name: "Dra. Helena Teste", specialtyId, active: true,
  specialty: { id: specialtyId, name: "Clínica médica", active: true } };
const employee = { id: userId, name: "Dra. Helena Teste", email: "helena@example.test", role: "MEDICO", active: true };
const patient = { id: patientId, fullName: "Paciente Sintético", cpf: "52998224725", email: "teste@example.test",
  phone: null, birthDate: null, createdAt: ts, updatedAt: ts };
const visit = { id: entryId, patientId, enteredAt: ts, status: "FINALIZADO", severity: "AMARELO", queueCode: "AV-001",
  patient: { id: patientId, fullName: patient.fullName }, doctor: { id: doctorId, name: doctor.name },
  attendance: { calledAt: ts, startedAt: ts, finishedAt: ts, room: "02" } };
const shift = { id: shiftId, doctorId, startsAt: "2026-11-01T11:00:00.000Z",
  endsAt: "2026-11-01T17:00:00.000Z", availabilityStatus: "DISPONIVEL", room: "02" };
const ticket = { id: ticketId, codigo: "N001", tipo: "normal", status: "aguardando",
  horarioEmissao: ts, horarioChamada: null, horarioFinalizacao: null, entryId: null, nomePaciente: null };
const pageOf = (items: unknown[], p = 1, pageSize = 10) => ({ items, page: p, pageSize, total: items.length });

type State = { requests: Array<{ method: string; path: string; body?: unknown }> };
async function backend(page: Page, role: "ADMIN" | "MEDICO" | "RECEPCIONISTA" | null): Promise<State> {
  const state: State = { requests: [] };
  let currentTicket: typeof ticket | null = null;
  let waitingTickets = [ticket];
  let currentEmployee = { ...employee };
  await page.route("**/api/v1/**", route => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname.replace("/api/v1", "");
    const body = method === "POST" || method === "PATCH" ? req.postDataJSON() : undefined;
    state.requests.push({ method, path, body });
    const reply = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (path === "/auth/login" && method === "POST") return reply({
      accessToken: "synthetic-browser-token", tokenType: "Bearer", expiresIn: 900,
      user: { id: userId, name: "Equipe Teste", email: "helena@example.test", role: role || "ADMIN" },
    });
    if (path === "/auth/me" && method === "GET") return reply({ id: userId, name: "Equipe Teste", email: "helena@example.test", role });
    if (path === "/auth/logout" && method === "POST") return route.fulfill({ status: 204, body: "" });

    if (path === "/admin/dashboard" || path === "/doctors/me/dashboard")
      return reply({ date: "2026-10-19", waiting: 1, called: 0, inProgress: 0, completedToday: 2, cancelledToday: 1 });
    if (path === "/employees" && method === "GET") return reply(pageOf([currentEmployee], Number(url.searchParams.get("page") || 1), Number(url.searchParams.get("pageSize") || 10)));
    if (path === "/employees/" + userId && method === "PATCH") { currentEmployee = { ...currentEmployee, ...body }; return reply(currentEmployee); }
    if (path === "/admin/doctors" && method === "GET") return reply(pageOf([doctor], 1, Number(url.searchParams.get("pageSize") || 10)));
    if (path === "/specialties" && method === "GET") return reply(pageOf([doctor.specialty], 1, 100));
    if (path === "/doctors" && method === "GET") return reply(pageOf([{ id: doctorId, name: doctor.name,
      specialty: doctor.specialty, shift: { ...shift, id: shiftId } }], 1, 100));
    if (path === "/doctors" && method === "POST") return reply(doctor, 201);
    if (path === "/doctors/" + doctorId && method === "GET") return reply(doctor);
    if (path === "/doctors/" + doctorId && method === "PATCH") return reply({ ...doctor, ...body });
    if (path === "/doctors/" + doctorId + "/shifts" && method === "GET") return reply(pageOf([shift], 1, 100));
    if (path === "/doctors/" + doctorId + "/shifts" && method === "POST") return reply({ ...shift, ...body }, 201);
    if (path === "/doctors/" + doctorId + "/shifts/" + shiftId && method === "PATCH") return reply({ ...shift, ...body });
    if (path === "/doctors/me/active") return reply(null);
    if (path === "/queues/me" || path === "/queues/waiting") return reply({ items: [] });
    if (path === "/doctors/me/entries" || path === "/entries" || path === "/patients/" + patientId + "/entries")
      return reply(pageOf([visit], Number(url.searchParams.get("page") || 1)));
    if (path === "/patients/" + patientId && method === "GET") return reply(patient);
    if (path === "/patients/" + patientId && method === "PATCH") return reply({ ...patient, ...body });
    if (path === "/patients" && method === "GET") return reply(pageOf([patient]));
    if (path === "/entries/" + entryId + "/prescription.pdf" && method === "GET") {
      return route.fulfill({ status: 200, headers: { "Content-Type": "application/pdf" }, body: "%PDF-1.4\n%%EOF" });
    }
    if (path === "/admin/reports" && method === "GET") return reply({
      period: { dateFrom: url.searchParams.get("dateFrom"), dateTo: url.searchParams.get("dateTo"), timezone: "America/Sao_Paulo" },
      summary: { totalEntries: 2, waiting: 0, called: 0, inProgress: 0, completed: 1, cancelled: 1, averageWaitSeconds: null, measuredWaits: 0 },
      bySeverity: [{ severity: "AMARELO", count: 2 }],
      doctors: [{ doctorId, name: doctor.name, completed: 1, averageAttendanceSeconds: 900 }],
    });
    if (path === "/public/calls" && method === "GET") return reply({ items: [{ queueCode: "AV-001", room: "02", calledAt: ts }] });
    if (path === "/tickets/waiting" && method === "GET") return reply({ items: waitingTickets });
    if (path === "/tickets/current" && method === "GET") return reply(currentTicket);
    if (path === "/tickets" && method === "POST") { waitingTickets = [ticket]; return reply(ticket, 201); }
    if (path === "/tickets/call-next" && method === "POST") {
      if (!waitingTickets.length) return route.fulfill({ status: 204, body: "" });
      currentTicket = { ...ticket, status: "chamada", horarioChamada: ts }; waitingTickets = []; return reply(currentTicket);
    }
    if (path === "/tickets/" + ticketId + "/recall" && method === "POST") return reply(currentTicket);
    if (path === "/tickets/" + ticketId + "/status" && method === "PATCH") {
      currentTicket = null; waitingTickets = []; return reply({ ...ticket, status: body.status });
    }
    if (path === "/auth/password-reset/request" && method === "POST") return reply({ message: "Se houver uma conta ativa, enviaremos um link." }, 202);
    if (path === "/auth/password-reset/confirm" && method === "POST") return route.fulfill({ status: 204, body: "" });
    return reply({ error: { code: "UNMOCKED_ENDPOINT", message: path } }, 503);
  });

  if (role) {
    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill("helena@example.test");
    await page.getByLabel("Senha", { exact: true }).fill("senha-local");
    await page.getByRole("button", { name: "Entrar no sistema" }).click();
    await expect(page).toHaveURL(role === "ADMIN" ? "/admin" : role === "MEDICO" ? "/medico" : "/recepcao");
  }
  return state;
}
async function go(page: Page, path: string) {
  await page.evaluate(route => { history.pushState({}, "", route); dispatchEvent(new PopStateEvent("popstate")); }, path);
  await expect(page).toHaveURL(path);
}

test("admin cria perfil médico pelo contrato POST /doctors vinculado a uma conta existente", async ({ page }) => {
  const state = await backend(page, "ADMIN");
  await go(page, "/admin/medicos");
  await expect(page.getByRole("heading", { name: "Médicos", exact: true })).toBeVisible();
  await page.getByLabel("Conta médica ativa").selectOption(userId);
  await page.getByLabel("Especialidade").selectOption(specialtyId);
  await page.getByRole("button", { name: "Cadastrar perfil médico" }).click();
  await expect.poll(() => state.requests.some(r => r.method === "POST" && r.path === "/doctors")).toBe(true);
  expect(state.requests.find(r => r.method === "POST" && r.path === "/doctors")?.body)
    .toEqual({ userId, specialtyId, active: true });
  await page.getByRole("button", { name: "Detalhes" }).click();
  await expect(page.getByRole("heading", { name: doctor.name })).toBeVisible();
  expect(state.requests.some(r => r.path === "/doctors/" + doctorId)).toBe(true);
  expect(state.requests.some(r => r.path === "/doctors/" + doctorId + "/shifts")).toBe(true);
});

test("admin cadastra plantão com sala textual e janela ISO, sem usar rotas inexistentes", async ({ page }) => {
  const state = await backend(page, "ADMIN");
  await go(page, "/admin/plantoes");
  await page.getByLabel("Médico", { exact: true }).selectOption(doctorId);
  await page.getByLabel("Início").fill("2026-11-02T08:00");
  await page.getByLabel("Fim").fill("2026-11-02T12:00");
  await page.getByLabel("Sala ou consultório").fill("03");
  await page.getByRole("button", { name: "Adicionar plantão" }).click();
  await expect.poll(() => state.requests.some(r => r.path === "/doctors/" + doctorId + "/shifts" && r.method === "POST")).toBe(true);
  const body = state.requests.find(r => r.path === "/doctors/" + doctorId + "/shifts" && r.method === "POST")?.body as { room: string; startsAt: string; endsAt: string };
  expect(body.room).toBe("03");
  expect(new Date(body.startsAt).getTime()).toBeLessThan(new Date(body.endsAt).getTime());
  expect(state.requests.some(r => r.path === "/admin/shifts")).toBe(false);
});

test("recepção emite, chama, repete e finaliza senha sem interferir na fila do médico", async ({ page }) => {
  const state = await backend(page, "RECEPCIONISTA");
  await go(page, "/recepcao/senhas");
  await expect(page.getByRole("heading", { name: "Controle de senhas" })).toBeVisible();
  await page.getByRole("button", { name: "Emitir senha" }).click();
  await expect.poll(() => state.requests.some(r => r.method === "POST" && r.path === "/tickets")).toBe(true);
  await page.getByRole("button", { name: "Chamar próxima" }).click();
  await expect(page.getByRole("button", { name: "Chamar novamente" })).toBeVisible();
  await page.getByRole("button", { name: "Chamar novamente" }).click();
  await page.getByRole("button", { name: "Finalizar senha" }).click();
  await expect.poll(() => state.requests.some(r => r.path === "/tickets/" + ticketId + "/status")).toBe(true);
  expect(state.requests.some(r => r.path === "/queues/me/next")).toBe(false);
});

test("histórico de recepção e paciente, edição de contato e impressão autorizada", async ({ page }) => {
  const state = await backend(page, "RECEPCIONISTA");
  await go(page, "/recepcao/entradas");
  await expect(page.getByRole("cell", { name: patient.fullName })).toBeVisible();
  await go(page, "/novo-cadastro?patient=" + patientId);
  await expect(page.getByRole("heading", { name: "Histórico de comparecimentos" })).toBeVisible();
  await page.getByRole("button", { name: "Editar contato" }).click();
  await page.getByRole("textbox", { name: "Telefone" }).fill("11999999999");
  await page.getByRole("button", { name: "Salvar contato" }).click();
  await expect.poll(() => state.requests.some(r => r.path === "/patients/" + patientId && r.method === "PATCH")).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar prescrição" }).click();
  expect((await download).suggestedFilename()).toBe("prescricao-" + entryId + ".pdf");
});

test("médico recupera atendimento ativo e consulta histórico real sem falsos dados", async ({ page }) => {
  const state = await backend(page, "MEDICO");
  await expect(page.getByRole("heading", { name: "Dashboard médico" })).toBeVisible();
  await expect.poll(() => state.requests.some(r => r.path === "/doctors/me/active")).toBe(true);
  await expect.poll(() => state.requests.some(r => r.path === "/doctors/me/dashboard")).toBe(true);
  await go(page, "/medico/historico");
  await expect(page.getByRole("cell", { name: patient.fullName })).toBeVisible();
  expect(state.requests.some(r => r.path === "/doctors/me/entries")).toBe(true);
});

test("admin altera funcionário e visualiza relatório real agregado por período", async ({ page }) => {
  const state = await backend(page, "ADMIN");
  await go(page, "/admin/usuarios");
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Dra. Helena Atualizada");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect.poll(() => state.requests.some(r => r.path === "/employees/" + userId && r.method === "PATCH")).toBe(true);
  await go(page, "/admin/relatorios");
  await page.getByRole("button", { name: "Gerar relatório" }).click();
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  expect(state.requests.some(r => r.path === "/admin/reports")).toBe(true);
});

test("TV pública mostra somente senha e sala, sem identificação do paciente", async ({ page }) => {
  const state = await backend(page, null);
  await page.goto("/transmissao/tv");
  await expect(page.locator(".chamada-ticket")).toHaveText("AV-001");
  await expect(page.getByText("02", { exact: true })).toBeVisible();
  await expect(page.getByText(patient.fullName)).toHaveCount(0);
  expect(state.requests.some(r => r.path === "/public/calls")).toBe(true);
});

test("recuperação por token funciona sem autenticação e confirma nova senha", async ({ page }) => {
  const state = await backend(page, null);
  await page.goto("/recuperar-senha");
  await page.getByLabel("E-mail corporativo").fill("helena@example.test");
  await page.getByRole("button", { name: "Solicitar link" }).click();
  await expect(page.getByText(/Se existir uma conta ativa/)).toBeVisible();
  await page.goto("/reset-password?token=" + "a".repeat(64));
  await page.getByLabel("Nova senha").fill("senhaSeguraComMaisDeOito");
  await page.getByLabel("Repita a senha").fill("senhaSeguraComMaisDeOito");
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByText(/Senha atualizada/)).toBeVisible();
  expect(state.requests.some(r => r.path === "/auth/password-reset/request")).toBe(true);
  expect(state.requests.some(r => r.path === "/auth/password-reset/confirm")).toBe(true);
});

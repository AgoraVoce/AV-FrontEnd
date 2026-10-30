import { test, expect, type Page } from "@playwright/test";
import type { Professional, Room, Shift } from "../src/features/clinic/types";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const specialty = {
  id: id(1),
  name: "Clínica médica",
  active: true,
  description: null,
  doctorCount: 2,
};
const activeRoom: Room = {
  id: id(2),
  name: "Consultório 02",
  type: "Consultório",
  status: "ativa",
};
const inactiveRoom: Room = {
  id: id(3),
  name: "Consultório 03",
  type: "Consultório",
  status: "manutencao",
};
const initialDoctor: Professional = {
  id: id(4),
  userId: id(5),
  name: "Dra. Helena",
  user: { email: "helena@example.test" },
  crmNumber: "0012345678",
  crmUf: "SP",
  phone: "11999999999",
  specialtyId: specialty.id,
  specialty,
  active: true,
  defaultRoomId: activeRoom.id,
  defaultRoom: activeRoom,
};
const secondDoctor: Professional = {
  ...initialDoctor,
  id: id(6),
  userId: id(7),
  name: "Dr. Pedro",
  crmNumber: "4444",
};
const initialShift: Shift = {
  id: id(8),
  doctorId: initialDoctor.id,
  doctor: {
    id: initialDoctor.id,
    name: initialDoctor.name,
    specialtyId: specialty.id,
  },
  roomId: activeRoom.id,
  room: activeRoom.name,
  startsAt: "2030-11-04T11:00:00.000Z",
  endsAt: "2030-11-04T15:00:00.000Z",
  availabilityStatus: "DISPONIVEL",
  recurrenceId: null,
};
const pagination = <T>(items: T[], p: number, size: number) => ({
  items: items.slice((p - 1) * size, p * size),
  total: items.length,
  page: p,
  pageSize: size,
});

async function backend(
  page: Page,
  options: {
    shifts?: Shift[];
    failList?: boolean;
    failSpecialties?: boolean;
    duplicate?: boolean;
    saveConflict?: boolean;
  } = {},
) {
  const state = {
    doctors: [structuredClone(initialDoctor), structuredClone(secondDoctor)],
    rooms: [structuredClone(activeRoom), structuredClone(inactiveRoom)],
    shifts: options.shifts ?? [structuredClone(initialShift)],
    requests: [] as {
      method: string;
      path: string;
      query: URLSearchParams;
      body?: Record<string, unknown>;
    }[],
    ...options,
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api/v1", ""),
      method = req.method();
    const body = ["POST", "PATCH"].includes(method)
      ? req.postDataJSON()
      : undefined;
    state.requests.push({ method, path, query: url.searchParams, body });
    const reply = (json: unknown, status = 200) =>
      route.fulfill({ status, json });
    const fail = (code: string, status = 409) =>
      reply({ error: { code, message: code } }, status);
    const p = Number(url.searchParams.get("page") || 1),
      size = Number(url.searchParams.get("pageSize") || 10);
    if (path === "/auth/login")
      return reply({
        accessToken: "synthetic-test-token",
        tokenType: "Bearer",
        expiresIn: 900,
        user: {
          id: id(9),
          role: "ADMIN",
          name: "Admin Teste",
          email: "admin@example.test",
        },
      });
    if (path === "/auth/me")
      return reply({
        id: id(9),
        role: "ADMIN",
        name: "Admin Teste",
        email: "admin@example.test",
      });
    if (path === "/admin/dashboard")
      return reply({
        date: "2030-11-04",
        waiting: 0,
        called: 0,
        inProgress: 0,
        completedToday: 0,
        cancelledToday: 0,
      });
    if (path === "/specialties")
      return state.failSpecialties
        ? fail("INTERNAL_ERROR", 500)
        : reply(pagination([specialty], p, size));
    if (path === "/rooms" && method === "GET")
      return reply({ items: state.rooms });
    if (path === "/rooms" && method === "POST") {
      const room = { id: id(20), ...body } as Room;
      state.rooms.push(room);
      return reply(room, 201);
    }
    if (path.startsWith("/rooms/") && method === "PATCH") {
      const room = state.rooms.find((r) => r.id === path.split("/").at(-1))!;
      Object.assign(room, body);
      return reply(room);
    }
    if (path === "/employees" && method === "GET")
      return reply(
        pagination(
          [
            {
              id: id(40),
              name: "Médico sem vínculo",
              email: "semvinculo@example.test",
              role: "MEDICO",
              active: true,
            },
            {
              id: initialDoctor.userId,
              name: initialDoctor.name,
              email: initialDoctor.user.email,
              role: "MEDICO",
              active: true,
            },
          ],
          p,
          size,
        ),
      );
    if (path === "/doctors" && method === "POST") {
      const doctor = {
        ...initialDoctor,
        id: id(41),
        userId: body.userId,
        name: "Médico sem vínculo",
        user: { email: "semvinculo@example.test" },
        crmNumber: null,
        crmUf: null,
        phone: null,
      };
      state.doctors.push(doctor);
      return reply(doctor, 201);
    }
    if (path === "/admin/doctors" && method === "GET") {
      if (state.failList) return fail("UNAVAILABLE", 503);
      const q = url.searchParams.get("q")?.toLowerCase() || "";
      if (url.searchParams.has("q") && !q) return fail("VALIDATION_ERROR", 400);
      const list = state.doctors.filter(
        (d) =>
          (!q ||
            d.name.toLowerCase().includes(q) ||
            d.crmNumber?.includes(q)) &&
          (!url.searchParams.has("specialtyId") ||
            d.specialtyId === url.searchParams.get("specialtyId")) &&
          (!url.searchParams.has("active") ||
            String(d.active) === url.searchParams.get("active")),
      );
      return reply(pagination(list, p, size));
    }
    if (path === "/admin/doctors" && method === "POST") {
      if (state.duplicate) return fail("CRM_EXISTS");
      const doctor = {
        ...initialDoctor,
        ...body,
        id: id(21),
        user: { email: body.email },
      } as Professional;
      state.doctors.push(doctor);
      return reply(doctor, 201);
    }
    if (
      path.startsWith("/doctors/") &&
      !path.includes("/shifts") &&
      method === "PATCH"
    ) {
      const doctor = state.doctors.find(
        (d) => d.id === path.split("/").at(-1),
      )!;
      Object.assign(doctor, body);
      if (body.email) doctor.user.email = body.email as string;
      return reply(doctor);
    }
    if (path === "/admin/shifts" && method === "GET")
      return reply(pagination(state.shifts, p, size));
    if (path.includes("/shifts") && method === "POST") {
      if (state.saveConflict) return fail("ROOM_SHIFT_OVERLAP");
      const shift = {
        id: id(22),
        doctorId: path.split("/")[2],
        recurrenceId: null,
        room: state.rooms.find((r) => r.id === body.roomId)?.name,
        ...body,
      } as Shift;
      state.shifts.push(shift);
      return reply(shift, 201);
    }
    if (path.includes("/shifts/") && method === "PATCH") {
      const shift = state.shifts.find((s) => s.id === path.split("/").at(-1))!;
      Object.assign(shift, body);
      return reply(shift);
    }
    return fail("UNEXPECTED_ENDPOINT", 501);
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL("/admin");
  return state;
}
async function go(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState({}, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}
async function fillDoctor(page: Page) {
  await page.getByRole("button", { name: "Novo médico" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo médico" });
  await dialog.getByLabel("Nome completo").fill("Dra. Nova");
  await dialog.getByLabel("E-mail").fill("nova@example.test");
  await dialog.getByLabel("CRM (número)").fill("0012345679");
  await dialog.getByLabel("Telefone").fill("11988888888");
  await dialog.getByLabel("Especialidade principal").selectOption(specialty.id);
  await dialog.getByLabel("Sala padrão").selectOption(activeRoom.id);
  await dialog.getByLabel("Senha inicial").fill("synthetic-password");
  return dialog;
}
async function newShift(page: Page, doctorId = initialDoctor.id) {
  await page.getByRole("button", { name: "Novo plantão" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo plantão" });
  await dialog.getByLabel("Médico").selectOption(doctorId);
  return dialog;
}

test("cadastro completo e edição preservam senha e usam as rotas publicadas", async ({
  page,
}) => {
  const state = await backend(page);
  await go(page, "/admin/medicos");
  const dialog = await fillDoctor(page);
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    state.requests.find(
      (r) => r.method === "POST" && r.path === "/admin/doctors",
    )?.body,
  ).toMatchObject({
    crmNumber: "0012345679",
    crmUf: "SP",
    phone: "11988888888",
    defaultRoomId: activeRoom.id,
    password: "synthetic-password",
  });
  await expect(page.getByText("Dra. Nova", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Editar Dra. Nova", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Editar médico" });
  await editor.getByLabel("Nome completo").fill("Dra. Atualizada");
  await editor.getByLabel("E-mail").fill("atualizada@example.test");
  await editor.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const body = state.requests.find(
    (r) => r.method === "PATCH" && r.path === "/doctors/" + id(21),
  )?.body;
  expect(body).toMatchObject({
    name: "Dra. Atualizada",
    email: "atualizada@example.test",
  });
  expect(body).not.toHaveProperty("password");
  await expect(
    page.getByText("Dra. Atualizada", { exact: true }),
  ).toBeVisible();
});

test("busca por CRM, filtros e vazio usam parâmetros opcionais válidos", async ({
  page,
}) => {
  const state = await backend(page);
  await go(page, "/admin/medicos");
  await expect(
    page.getByText(initialDoctor.name, { exact: true }),
  ).toBeVisible();
  expect(
    state.requests
      .filter((r) => r.path === "/admin/doctors")
      .every((r) => !r.query.has("q")),
  ).toBe(true);
  await page.getByLabel("Buscar por nome ou CRM").fill("0012345678");
  await expect(page.getByText(secondDoctor.name, { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("combobox", { name: "Especialidade", exact: true })
    .selectOption(specialty.id);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("false");
  await expect(
    page.getByRole("heading", { name: "Nenhum registro encontrado" }),
  ).toBeVisible();
  expect(state.requests.at(-1)?.query.get("q")).toBe("0012345678");
});

test("erro de unicidade aparece no campo e não permanece ao reabrir cadastro", async ({
  page,
}) => {
  await backend(page, { duplicate: true });
  await go(page, "/admin/medicos");
  const dialog = await fillDoctor(page);
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog.getByRole("alert").first()).toContainText("CRM");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Novo médico" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
});

test("inativação exige confirmação e persiste situação", async ({ page }) => {
  const state = await backend(page);
  await go(page, "/admin/medicos");
  const record = page
    .locator(".clinic-record")
    .filter({ has: page.getByText(initialDoctor.name, { exact: true }) });
  await record.getByRole("button", { name: "Inativar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Inativar médico?" });
  expect(state.requests.some((r) => r.method === "PATCH")).toBe(false);
  await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(record.getByText("Inativo", { exact: true })).toBeVisible();
});

test("salas permitem cadastro, edição, manutenção, filtros e inativação sem DELETE", async ({
  page,
}) => {
  const state = await backend(page);
  await go(page, "/admin/salas");
  await page.getByRole("button", { name: "Nova sala" }).click();
  let dialog = page.getByRole("dialog", { name: "Nova sala" });
  await dialog.getByLabel("Nome / número").fill("Consultório 10");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Editar Consultório 10" }).click();
  dialog = page.getByRole("dialog", { name: "Editar sala" });
  await dialog.getByLabel("Nome / número").fill("Consultório 11");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Buscar sala").fill("11");
  await expect(page.locator(".clinic-record")).toHaveCount(1);
  await page.getByRole("button", { name: "Inativar Consultório 11" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(
    page.locator(".clinic-record").getByText("Inativa", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("ativa");
  await expect(
    page.getByRole("heading", { name: "Nenhum registro encontrado" }),
  ).toBeVisible();
  expect(state.requests.some((r) => r.method === "DELETE")).toBe(false);
});

test("plantão sugere sala ativa, grava referência, permite editar e cancelar", async ({
  page,
}) => {
  const state = await backend(page);
  await go(page, "/admin/plantoes");
  const dialog = await newShift(page);
  await expect(dialog.getByLabel("Sala", { exact: false })).toHaveValue(
    activeRoom.id,
  );
  await expect(
    dialog.getByRole("option", { name: inactiveRoom.name, exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel("Data e horário de início").fill("2030-11-05T08:00");
  await dialog.getByLabel("Data e horário de fim").fill("2030-11-05T12:00");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    state.requests.find(
      (r) => r.method === "POST" && r.path.endsWith("/shifts"),
    )?.body,
  ).toEqual({
    startsAt: "2030-11-05T08:00:00-03:00",
    endsAt: "2030-11-05T12:00:00-03:00",
    roomId: activeRoom.id,
    availabilityStatus: "DISPONIVEL",
  });
  await page.getByLabel("Visualização").selectOption("list");
  const entry = page.locator(".clinic-slot").filter({ hasText: "05/11/2030" });
  await entry.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Editar ocorrência" });
  await editor.getByLabel("Data e horário de fim").fill("2030-11-05T13:00");
  await editor.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await entry.getByRole("button", { name: "Cancelar plantão" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(entry.getByText("Cancelado", { exact: true })).toBeVisible();
});

test("valida intervalo e conflito da mesma sala entre médicos", async ({
  page,
}) => {
  const state = await backend(page);
  await go(page, "/admin/plantoes");
  const dialog = await newShift(page, secondDoctor.id);
  await dialog.getByLabel("Data e horário de início").fill("2030-11-04T09:00");
  await dialog.getByLabel("Data e horário de fim").fill("2030-11-04T08:00");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("final deve ser maior");
  await dialog.getByLabel("Data e horário de fim").fill("2030-11-04T10:00");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog.getByRole("alert").first()).toContainText(
    "A sala já possui",
  );
  expect(
    state.requests.some(
      (r) => r.method === "POST" && r.path.includes("/shifts"),
    ),
  ).toBe(false);
});

test("carrega todas as páginas da escala para detectar conflito posterior", async ({
  page,
}) => {
  const shifts = Array.from({ length: 100 }, (_, i) => ({
    ...initialShift,
    id: id(100 + i),
    availabilityStatus: "INDISPONIVEL" as const,
  }));
  shifts.push(initialShift);
  const state = await backend(page, { shifts });
  await go(page, "/admin/plantoes");
  const dialog = await newShift(page, secondDoctor.id);
  expect(
    state.requests.some(
      (r) => r.path === "/admin/shifts" && r.query.get("page") === "2",
    ),
  ).toBe(true);
  await dialog.getByLabel("Data e horário de início").fill("2030-11-04T09:00");
  await dialog.getByLabel("Data e horário de fim").fill("2030-11-04T10:00");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog.getByRole("alert").first()).toContainText(
    "A sala já possui",
  );
});

test("conflito concorrente retornado pelo servidor mantém formulário para correção", async ({
  page,
}) => {
  await backend(page, { shifts: [], saveConflict: true });
  await go(page, "/admin/plantoes");
  const dialog = await newShift(page);
  await dialog.getByLabel("Data e horário de início").fill("2030-11-05T09:00");
  await dialog.getByLabel("Data e horário de fim").fill("2030-11-05T10:00");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog.getByRole("alert").first()).toContainText(
    "A sala já possui",
  );
  await expect(dialog.getByLabel("Sala", { exact: false })).toHaveValue(
    activeRoom.id,
  );
});

test("loading, erro e retry recuperam listagem sem depender das especialidades", async ({
  page,
}) => {
  const state = await backend(page, { failList: true, failSpecialties: true });
  await go(page, "/admin/medicos");
  await expect(
    page.getByRole("status").filter({ hasText: "Carregando dados" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("alert").first()).toBeVisible();
  state.failList = false;
  await page.getByRole("button", { name: "Tentar novamente" }).last().click();
  await expect(
    page.getByText(initialDoctor.name, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Novo médico" }),
  ).toBeDisabled();
});

test("editar nome preserva vínculos inativos e não reenvia e-mail inalterado", async ({
  page,
}) => {
  const state = await backend(page);
  state.doctors[0].defaultRoomId = inactiveRoom.id;
  state.doctors[0].defaultRoom = inactiveRoom;
  await page.route("**/api/v1/specialties?*", (route) =>
    route.fulfill({
      json: pagination([{ ...specialty, active: false }], 1, 100),
    }),
  );
  await go(page, "/admin/medicos");
  await page
    .getByRole("button", { name: "Editar " + initialDoctor.name, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Editar médico" });
  await dialog.getByLabel("Nome completo").fill("Dra. Nome atualizado");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.requests.find((r) => r.method === "PATCH")?.body).toEqual({
    name: "Dra. Nome atualizado",
  });
});

test("conta médica existente recebe vínculo clínico sem criar outro login", async ({
  page,
}) => {
  const state = await backend(page);
  await go(page, "/admin/medicos");
  await page.getByRole("button", { name: "Vincular conta existente" }).click();
  const dialog = page.getByRole("dialog", { name: "Vincular conta existente" });
  await dialog.getByLabel("Conta médica existente").selectOption(id(40));
  await expect(
    dialog.getByRole("option", { name: new RegExp(initialDoctor.user.email) }),
  ).toHaveCount(0);
  await dialog
    .getByLabel("Especialidade", { exact: false })
    .selectOption(specialty.id);
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Médico sem vínculo", { exact: true }),
  ).toBeVisible();
  expect(
    state.requests.find((r) => r.path === "/doctors" && r.method === "POST")
      ?.body,
  ).toEqual({ userId: id(40), specialtyId: specialty.id, active: true });
  expect(
    state.requests.some(
      (r) =>
        r.method === "POST" &&
        (r.path === "/employees" || r.path === "/admin/doctors"),
    ),
  ).toBe(false);
});

test("Funcionários direciona cadastro médico para conta e perfil atômicos", async ({
  page,
}) => {
  const state = await backend(page);
  await go(page, "/admin/novo-funcionario");
  await page.getByLabel("Perfil", { exact: false }).selectOption("MEDICO");
  await page.getByRole("button", { name: "Continuar cadastro médico" }).click();
  await expect(page).toHaveURL("/admin/medicos?novo=1");
  await expect(page.getByRole("dialog", { name: "Novo médico" })).toBeVisible();
  expect(
    state.requests.some((r) => r.method === "POST" && r.path === "/employees"),
  ).toBe(false);
});

test("perfil médico indisponível mostra uma orientação e permite verificar após regularização", async ({
  page,
}) => {
  let ready = false,
    queueRequests = 0;
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const user = {
      id: initialDoctor.userId,
      role: "MEDICO",
      name: initialDoctor.name,
      email: initialDoctor.user.email,
    };
    const reply = (json: unknown, status = 200) =>
      route.fulfill({ status, json });
    if (path === "/auth/login")
      return reply({
        accessToken: "synthetic-token",
        tokenType: "Bearer",
        expiresIn: 900,
        user,
      });
    if (path === "/auth/me") return reply(user);
    if (path === "/queues/me") queueRequests++;
    if (!ready)
      return reply(
        {
          error: {
            code: "DOCTOR_PROFILE_UNAVAILABLE",
            message: "Doctor profile unavailable",
          },
        },
        403,
      );
    if (path === "/doctors/me/active") return reply(null);
    if (path === "/queues/me") return reply({ items: [] });
    if (path === "/doctors/me/dashboard")
      return reply({
        date: "2030-11-04",
        waiting: 0,
        called: 0,
        inProgress: 0,
        completedToday: 0,
        cancelledToday: 0,
      });
    return reply({});
  });
  await page.goto("/login");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(initialDoctor.user.email);
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("alert")).toContainText("ausente ou inativo");
  await expect(page.getByText("Disponível", { exact: true })).toHaveCount(0);
  const before = queueRequests;
  await page.clock.install();
  await page.clock.runFor(31000);
  expect(queueRequests).toBe(before);
  ready = true;
  await page
    .getByRole("button", { name: "Verificar cadastro novamente" })
    .click();
  await page.clock.runFor(1000);
  await expect(
    page.getByText("Não há pacientes aguardando neste momento."),
  ).toBeVisible();
});

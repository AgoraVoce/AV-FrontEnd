import { expect, test, type Page } from "@playwright/test";
import { validateShift } from "../src/features/shifts/validation";
import { validateDoctor } from "../src/features/doctors/validation";
import type { Shift } from "../src/features/clinic/types";
const specialty = {
  id: "s1",
  name: "Clínica médica",
  description: null,
  active: true,
  doctorCount: 1,
};
const room = {
  id: "r1",
  name: "Consultório 04",
  type: "Consultório",
  status: "ativa",
};
const doctor = {
  id: "d1",
  userId: "u1",
  name: "Helena Martins",
  user: { email: "helena@example.test" },
  crmNumber: "12345",
  crmUf: "SP",
  phone: "11999999999",
  specialtyId: "s1",
  specialty,
  defaultRoomId: "r1",
  defaultRoom: room,
  active: true,
};
const shift: Shift = {
  id: "p1",
  doctorId: "d1",
  roomId: "r1",
  room: "Consultório 04",
  startsAt: "2026-10-26T08:00:00-03:00",
  endsAt: "2026-10-26T12:00:00-03:00",
  availabilityStatus: "DISPONIVEL",
  recurrenceId: null,
  doctor: { id: "d1", name: doctor.name, specialtyId: "s1" },
};
const paged = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 10,
});
async function setup(page: Page, role = "ADMIN") {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      method = route.request().method();
    if (path.endsWith("/auth/login"))
      return route.fulfill({
        json: {
          accessToken: "synthetic-token",
          tokenType: "Bearer",
          expiresIn: 900,
          user: {
            id: "u1",
            name: doctor.name,
            email: "helena@example.test",
            role,
          },
        },
      });
    if (path.endsWith("/specialties") && method === "GET")
      return route.fulfill({ json: paged([specialty]) });
    if (path.endsWith("/rooms") && method === "GET")
      return route.fulfill({ json: { items: [room] } });
    if (path.endsWith("/admin/doctors") && method === "GET")
      return route.fulfill({ json: paged([doctor]) });
    if (path.endsWith("/employees")) return route.fulfill({ json: paged([]) });
    if (path.endsWith("/queues/me"))
      return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/doctors/me/profile"))
      return route.fulfill({ json: { ...doctor, nextShift: shift } });
    if (path.endsWith("/admin/shifts") || path.endsWith("/doctors/me/shifts"))
      return route.fulfill({ json: { items: [shift] } });
    return route.fulfill({
      status: 503,
      json: { error: { code: "UNMOCKED_ENDPOINT" } },
    });
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("helena@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL(role === "ADMIN" ? "/admin" : "/medico");
}
test("valida formatos e conflitos de médico/sala, permite intervalos adjacentes e ignora cancelados", () => {
  const input = {
    startsAt: "2026-10-26T10:00:00-03:00",
    endsAt: "2026-10-26T11:00:00-03:00",
    roomId: "r2",
    availabilityStatus: "DISPONIVEL" as const,
  };
  expect(validateShift(input, "d1", [shift])).toContain("médico");
  expect(validateShift({ ...input, roomId: "r1" }, "d2", [shift])).toContain(
    "sala",
  );
  expect(
    validateShift(
      { ...input, startsAt: shift.endsAt, endsAt: "2026-10-26T13:00:00-03:00" },
      "d1",
      [shift],
    ),
  ).toBe("");
  expect(
    validateShift({ ...input, endsAt: input.startsAt }, "d1", []),
  ).toContain("final");
  expect(
    validateShift(input, "d1", [
      { ...shift, availabilityStatus: "INDISPONIVEL" },
    ]),
  ).toBe("");
  expect(
    validateShift(
      {
        ...input,
        startsAt: "2026-10-19T10:00:00-03:00",
        endsAt: "2026-10-19T11:00:00-03:00",
      },
      "d1",
      [shift],
      undefined,
      "2026-11-02",
    ),
  ).toContain("médico");
  expect(
    validateDoctor({
      name: "A",
      email: "invalid",
      crmNumber: "001",
      crmUf: "XX",
      phone: "1",
      specialtyId: "",
      defaultRoomId: null,
      active: true,
    }),
  ).toHaveProperty("crmNumber");
});
test("sidebar navega entre todas as telas administrativas e volta, com item ativo correto", async ({
  page,
}) => {
  await setup(page);
  for (const [label, path] of [
    ["Especialidades", "especialidades"],
    ["Salas e consultórios", "salas"],
    ["Médicos", "medicos"],
    ["Plantões", "plantoes"],
    ["Gestão de Usuários", "usuarios"],
  ]) {
    await page
      .getByRole("navigation", { name: "Módulos de atendimento" })
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page).toHaveURL("/admin/" + path);
    await expect(page.locator(".sidebar .is-active")).toHaveCount(1);
    await page
      .getByRole("link", { name: "Painel Administrativo", exact: true })
      .click();
    await expect(page).toHaveURL("/admin");
  }
});
test("especialidades cria, edita e confirma inativação de vinculada sem DELETE", async ({
  page,
}) => {
  await setup(page);
  let writes = 0;
  await page.route("**/api/v1/specialties", async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    writes++;
    expect(route.request().postDataJSON()).toMatchObject({
      name: "Cardiologia",
      active: true,
    });
    await route.fulfill({
      status: 201,
      json: { ...specialty, id: "s2", name: "Cardiologia" },
    });
  });
  await page.getByRole("link", { name: "Especialidades", exact: true }).click();
  await page.getByRole("button", { name: "Nova especialidade" }).click();
  await expect(page.getByRole("dialog", { name: "Nova especialidade" })).toBeVisible();
  await page.getByLabel("Nome *", { exact: true }).fill("Cardiologia");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Alteração salva")).toBeVisible();
  expect(writes).toBe(1);
  await page.route("**/api/v1/specialties/s1", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON().active).toBe(false);
    await route.fulfill({ json: { ...specialty, active: false } });
  });
  await page.getByRole("button", { name: "Especialidade vinculada" }).click();
  await expect(page.getByRole("dialog")).toContainText("não pode ser excluída");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("sala vinculada não é removida e oferece inativar após conflito da API", async ({
  page,
}) => {
  await setup(page);
  let inactive = false;
  await page.route("**/api/v1/rooms/r1", async (route) => {
    if (route.request().method() === "DELETE")
      return route.fulfill({
        status: 409,
        json: { error: { code: "ROOM_IN_USE" } },
      });
    inactive = true;
    expect(route.request().postDataJSON().status).toBe("inativa");
    return route.fulfill({ json: { ...room, status: "inativa" } });
  });
  await page
    .getByRole("link", { name: "Salas e consultórios", exact: true })
    .click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Sala vinculada");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect.poll(() => inactive).toBe(true);
});
test("médico exibe erro CRM no campo, mantém dados para nova tentativa e salva edição", async ({
  page,
}) => {
  await setup(page);
  let attempts = 0;
  await page.route("**/api/v1/admin/doctors/d1", async (route) => {
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 409,
        json: { error: { code: "CRM_EXISTS" } },
      });
    expect(route.request().postDataJSON().name).toBe("Helena Atualizada");
    return route.fulfill({ json: { ...doctor, name: "Helena Atualizada" } });
  });
  await page.getByRole("link", { name: "Médicos", exact: true }).click();
  await page.getByRole("button", { name: "Editar Helena Martins" }).click();
  await page.getByLabel("Nome completo *").fill("Helena Atualizada");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.locator("form label").filter({ hasText: "CRM (número)" }),
  ).toContainText("já estão cadastrados");
  await expect(page.getByLabel("Nome completo *")).toHaveValue(
    "Helena Atualizada",
  );
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Editar médico", exact: true }),
  ).toHaveCount(0);
  expect(attempts).toBe(2);
});
test("plantão bloqueia conflito e envia avulso adjacente e recorrência para a API", async ({
  page,
}) => {
  await setup(page);
  let saved = 0;
  await page.route("**/api/v1/doctors/d1/shifts", async (route) => {
    saved++;
    expect(route.request().postDataJSON()).toMatchObject({
      roomId: "r1",
      startsAt: "2026-10-26T12:00:00-03:00",
    });
    await route.fulfill({ status: 201, json: { ...shift, id: "p2" } });
  });
  await page.getByRole("link", { name: "Plantões", exact: true }).click();
  await page.getByRole("button", { name: "Novo plantão" }).click();
  await expect(page.getByRole("dialog", { name: "Novo plantão" })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Médico *", exact: true })
    .selectOption("d1");
  await page
    .getByRole("combobox", { name: "Sala *", exact: true })
    .selectOption("r1");
  await page.getByLabel("Data e horário de início *").fill("2026-10-26T10:00");
  await page.getByLabel("Data e horário de fim *").fill("2026-10-26T11:00");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "médico já possui",
  );
  expect(saved).toBe(0);
  await page.getByLabel("Data e horário de início *").fill("2026-10-26T12:00");
  await page.getByLabel("Data e horário de fim *").fill("2026-10-26T13:00");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => saved).toBe(1);
  await page.route("**/api/v1/doctors/d1/shifts/series", async (route) => {
    saved++;
    expect(route.request().postDataJSON().until).toBe("2026-11-30");
    await route.fulfill({ status: 201, json: { items: [] } });
  });
  await page.getByRole("button", { name: "Novo plantão" }).click();
  await expect(page.getByRole("dialog", { name: "Novo plantão" })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Médico *", exact: true })
    .selectOption("d1");
  await page
    .getByRole("combobox", { name: "Sala *", exact: true })
    .selectOption("r1");
  await page.getByLabel("Data e horário de início *").fill("2026-11-02T12:00");
  await page.getByLabel("Data e horário de fim *").fill("2026-11-02T13:00");
  await page
    .getByRole("combobox", { name: "Recorrência", exact: true })
    .selectOption("true");
  await page.getByLabel("Repetir semanalmente até *").fill("2026-11-30");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => saved).toBe(2);
});
test("médico vê dados reais e navega pelo perfil, plantões, fila e atendimento sem ações administrativas", async ({
  page,
}) => {
  await setup(page, "MEDICO");
  await expect(
    page.getByRole("heading", { name: "Meu consultório e escala" }),
  ).toBeVisible();
  await expect(
    page.getByText("Consultório 04", { exact: true }).first(),
  ).toBeVisible();
  for (const [label, path] of [
    ["Meu perfil e consultório", "perfil"],
    ["Meus plantões", "plantoes"],
    ["Minha fila", "fila"],
    ["Paciente atual", "atendimento"],
  ]) {
    await page
      .locator(".sidebar")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page).toHaveURL("/medico/" + path);
    await expect(page.locator(".sidebar .is-active")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /Novo médico|Novo plantão/ }),
    ).toHaveCount(0);
    await page
      .locator(".sidebar")
      .getByRole("link", { name: "Consultório Médico", exact: true })
      .click();
    await expect(page).toHaveURL("/medico");
  }
  await page.evaluate(() => {
    history.pushState({}, "", "/admin/medicos");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByText("Esta área não está disponível para seu perfil."),
  ).toBeVisible();
});
test("carregamento, vazio, erro com nova tentativa e layout móvel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("link", { name: "Especialidades", exact: true }).click();
  let fail = true;
  await page.route("**/api/v1/specialties?*", (route) =>
    route.fulfill(
      fail
        ? { status: 503, json: { error: { code: "UNAVAILABLE" } } }
        : { json: paged([]) },
    ),
  );
  await page
    .getByRole("link", { name: "Voltar ao Painel Administrativo" })
    .click();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("link", { name: "Especialidades", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tentar novamente" }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum registro encontrado" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("cadastro médico envia campos completos e inativação exige confirmação", async ({
  page,
}) => {
  await setup(page);
  let created = false,
    deactivated = false;
  await page.route("**/api/v1/admin/doctors", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toMatchObject({
      name: "Ana Lima",
      email: "ana@example.test",
      crmNumber: "98765",
      crmUf: "RJ",
      specialtyId: "s1",
      defaultRoomId: "r1",
      password: "senha-sintetica",
    });
    created = true;
    await route.fulfill({ status: 201, json: { ...doctor, id: "d2" } });
  });
  await page.route("**/api/v1/doctors/d1", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ active: false });
    deactivated = true;
    await route.fulfill({ json: { ...doctor, active: false } });
  });
  await page.getByRole("link", { name: "Médicos", exact: true }).click();
  await page.getByRole("button", { name: "Novo médico" }).click();
  await page.getByLabel("Nome completo *").fill("Ana Lima");
  await page.getByLabel("E-mail *").fill("ana@example.test");
  await page.getByLabel("CRM (número) *").fill("98765");
  await page
    .getByRole("combobox", { name: "UF do CRM *", exact: true })
    .selectOption("RJ");
  await page
    .getByRole("combobox", { name: "Especialidade principal *", exact: true })
    .selectOption("s1");
  await page
    .getByRole("combobox", { name: "Sala padrão", exact: true })
    .selectOption("r1");
  await page.getByLabel("Senha inicial *").fill("senha-sintetica");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => created).toBe(true);
  await expect(page.locator("form")).toHaveCount(0);
  await page.getByRole("button", { name: "Inativar", exact: true }).click();
  expect(deactivated).toBe(false);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect.poll(() => deactivated).toBe(true);
});
test("salas criam e editam nome, tipo e situação com os serviços reais da interface", async ({
  page,
}) => {
  await setup(page);
  let created = false,
    edited = false;
  await page.route("**/api/v1/rooms", async (route) => {
    if (route.request().method() === 'GET') return route.fallback();
    expect(route.request().postDataJSON()).toEqual({
      name: "Sala de teste",
      type: "Procedimentos",
      status: "ativa",
    });
    created = true;
    await route.fulfill({ status: 201, json: { ...room, id: "r2" } });
  });
  await page.route("**/api/v1/rooms/r1", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      name: "Consultório renomeado",
      status: "ativa",
    });
    edited = true;
    await route.fulfill({ json: room });
  });
  await page
    .getByRole("link", { name: "Salas e consultórios", exact: true })
    .click();
  await page.getByRole("button", { name: "Nova sala" }).click();
  await page.getByLabel("Nome / número *").fill("Sala de teste");
  await page.getByLabel("Tipo *").fill("Procedimentos");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => created).toBe(true);
  await expect(page.locator("form")).toHaveCount(0);
  await page.getByRole("button", { name: "Editar Consultório 04" }).click();
  await page.getByLabel("Nome / número *").fill("Consultório renomeado");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => edited).toBe(true);
});
test("plantão edita ocorrência e cancela apenas após confirmar no modal", async ({
  page,
}) => {
  await setup(page);
  let edited = false,
    cancelled = false;
  await page.route("**/api/v1/doctors/d1/shifts/p1", async (route) => {
    const body = route.request().postDataJSON();
    if (body.availabilityStatus === "INDISPONIVEL") cancelled = true;
    else {
      expect(body.endsAt).toBe("2026-10-26T13:00:00-03:00");
      edited = true;
    }
    await route.fulfill({ json: shift });
  });
  await page.getByRole("link", { name: "Plantões", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Visualização", exact: true })
    .selectOption("list");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Data e horário de fim *").fill("2026-10-26T13:00");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => edited).toBe(true);
  await expect(page.locator("form")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cancelar plantão", exact: true })
    .click();
  await page.keyboard.press("Escape");
  expect(cancelled).toBe(false);
  await page
    .getByRole("button", { name: "Cancelar plantão", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect.poll(() => cancelled).toBe(true);
});

test("novas telas permanecem responsivas e produzem prévia para revisão", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("link", { name: "Médicos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar Helena Martins" }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/av-clinic-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of [
    "Médicos",
    "Plantões",
    "Salas e consultórios",
    "Especialidades",
  ]) {
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page
      .locator(".sidebar")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: "/tmp/av-clinic-mobile.png", fullPage: true });
});

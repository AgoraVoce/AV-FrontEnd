import { expect, test, type Page } from "@playwright/test";
import {
  patientAge,
  waitingMinutes,
} from "../src/integrations/reception-filters";

const NOW = Date.parse("2026-10-24T15:00:00Z");
const rows = [
  {
    id: "minor",
    name: "Paciente Jovem",
    born: "2009-10-25",
    level: "VERDE",
    wait: 15,
    complaint: "Tosse leve",
  },
  {
    id: "adult",
    name: "Paciente Adulto",
    born: "2008-10-24",
    level: "AMARELO",
    wait: 30,
    complaint: "Dor abdominal",
  },
  {
    id: "older",
    name: "Paciente Idoso",
    born: "1966-10-24",
    level: "VERMELHO",
    wait: 61,
    complaint: "Falta de ar",
  },
  {
    id: "unknown",
    name: "Paciente Sem Dados",
    born: null,
    level: null,
    wait: null,
    complaint: null,
  },
];
async function loginWithQueue(page: Page) {
  let unavailable = true;
  let revision = false;
  let detailRequests = 0;
  await page.clock.install({ time: NOW });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/login"))
      return route.fulfill({
        json: {
          accessToken: "filter-test",
          tokenType: "Bearer",
          expiresIn: 900,
          user: {
            id: "filter-user",
            name: "Recepção",
            email: "filter@test.test",
            role: "RECEPCIONISTA",
          },
        },
      });
    if (path.endsWith("/queues/waiting"))
      return route.fulfill({
        json: {
          items: rows.map((row) => ({
            entryId: row.id,
            fullName: row.name,
            queueCode: row.id === "unknown" ? null : row.id,
          })),
        },
      });
    if (path.includes("/entries/")) {
      detailRequests++;
      const row = rows.find((row) => path.endsWith(row.id))!;
      if (row.id === "unknown" && unavailable)
        return route.fulfill({
          status: 503,
          json: {
            error: { code: "UNAVAILABLE", message: "Temporarily unavailable" },
          },
        });
      return route.fulfill({
        json: {
          id: row.id,
          patientId: row.id,
          severity: row.id === "adult" && revision ? "VERMELHO" : row.level,
          status: "waiting",
          enteredAt:
            row.wait === null
              ? null
              : new Date(NOW - row.wait * 60_000).toISOString(),
          patient: { id: row.id, fullName: row.name, birthDate: row.born },
          otherSymptoms: row.complaint,
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("filter@test.test");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(
    page.getByText(/Não foi possível consultar os dados clínicos de 1/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  return {
    recover: () => {
      unavailable = false;
    },
    revise: () => {
      revision = true;
    },
    requests: () => detailRequests,
  };
}

test("idade considera aniversários, datas inválidas e o dia civil de São Paulo", () => {
  expect(patientAge("2008-10-24", NOW)).toBe(18);
  expect(patientAge("2008-10-25", NOW)).toBe(17);
  expect(patientAge("1966-10-24", NOW)).toBe(60);
  expect(patientAge("1966-10-25", NOW)).toBe(59);
  expect(patientAge("2008-10-24", Date.parse("2026-10-24T01:00:00Z"))).toBe(17);
  expect(patientAge("2027-01-01", NOW)).toBeNull();
  expect(patientAge("2000-02-30", NOW)).toBeNull();
  expect(patientAge(null, NOW)).toBeNull();
  expect(waitingMinutes("invalid", NOW)).toBeNull();
});

test("filtros combinam idade, cor, espera e busca usando detalhes reais; limpar restaura lista", async ({
  page,
}) => {
  await loginWithQueue(page);
  const filters = page.getByRole("region", { name: "Filtros da fila" });
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(page.locator('tr[data-priority-entry="adult"]')).toContainText(
    "18 anos",
  );
  await expect(page.locator('tr[data-priority-entry="adult"]')).toContainText(
    "30 min",
  );
  await filters.getByRole("combobox", { name: "Idade", exact: true }).selectOption("adult");
  await filters.getByLabel("Gravidade / cor").selectOption("AMARELO");
  await filters.getByLabel("Tempo de espera").selectOption("16-to-30");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Paciente Adulto");
  await page.getByRole("searchbox").fill("abdominal");
  await expect(page.locator("tbody tr")).toContainText("Paciente Adulto");
  await page.getByRole("searchbox").fill("");
  await filters.getByRole("combobox", { name: "Idade", exact: true }).selectOption("older");
  await expect(
    page.getByText("Nenhum paciente encontrado com os filtros selecionados"),
  ).toBeVisible();
  await filters.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  for (const [filter, option, name] of [
    ["Idade", "minor", "Paciente Jovem"],
    ["Idade", "older", "Paciente Idoso"],
    ["Tempo de espera", "up-to-15", "Paciente Jovem"],
    ["Tempo de espera", "over-60", "Paciente Idoso"],
    ["Gravidade / cor", "VERMELHO", "Paciente Idoso"],
    ["Idade", "unknown", "Paciente Sem Dados"],
    ["Tempo de espera", "unknown", "Paciente Sem Dados"],
    ["Gravidade / cor", "unknown", "Paciente Sem Dados"],
  ]) {
    await filters.getByRole("combobox", { name: filter, exact: true }).selectOption(option);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText(name);
    await filters.getByRole("button", { name: "Limpar filtros" }).click();
  }
});

test("polling preserva filtros, atualiza gravidade e tempo, recupera falha parcial; mobile sem overflow", async ({
  page,
}) => {
  const control = await loginWithQueue(page);
  const filters = page.getByRole("region", { name: "Filtros da fila" });
  await filters.getByLabel("Tempo de espera").selectOption("up-to-15");
  await expect(page.locator("tbody tr")).toContainText("Paciente Jovem");
  control.recover();
  control.revise();
  const before = control.requests();
  await page.clock.runFor(61_000);
  await expect.poll(control.requests).toBeGreaterThan(before);
  await expect(
    page.getByText("Nenhum paciente encontrado com os filtros selecionados"),
  ).toBeVisible();
  await expect(filters.getByLabel("Tempo de espera")).toHaveValue("up-to-15");
  await filters.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(
    page.getByText(/Não foi possível consultar os dados clínicos/),
  ).toHaveCount(0);
  await filters.getByLabel("Gravidade / cor").selectOption("VERMELHO");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/reception-filters-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

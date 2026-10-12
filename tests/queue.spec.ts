import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

async function api(page: Page, { role = "RECEPCIONISTA" } = {}) {
  await page.route("**/auth/me", async (route: Route) => {
    await route.fulfill({
      status: 200,
      json: {
        user: {
          id: "recepcionista-1",
          name: "Operador da Recepção",
          login: "recepcao@clinica.test",
          role,
        },
      },
    });
  });
}

test("carrega a fila geral e mostra o título com o total em espera", async ({
  page,
}) => {
  await api(page, { role: "RECEPCIONISTA" });
  await page.goto("/recepcao");

  await expect(
    page.getByRole("heading", {
      name: "Fila de Espera e Gestão de Prioridades",
    }),
  ).toBeVisible();

  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.locator(".total-card strong")).toHaveText("16");
});

test("o filtro por nome reduz as linhas da tabela em tempo real", async ({
  page,
}) => {
  await api(page, { role: "RECEPCIONISTA" });
  await page.goto("/recepcao");

  const search = page.getByLabel("Filtrar por nome, senha ou queixa");
  await search.fill("Maria");

  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText("Maria Clara Santos")).toBeVisible();

  await search.fill("000");
  await expect(page.getByText("Nenhum paciente encontrado.")).toBeVisible();
});

test("filtros avançados combinam prioridade, idade e espera e recalculam a lista", async ({
  page,
}) => {
  await page.goto("/recepcao?dev=recepcionista");
  await page.getByRole("button", { name: "Filtrar" }).click();
  const filters = page.getByRole("dialog", {
    name: "Filtros avançados da fila",
  });

  await filters.getByRole("combobox", { name: "Prioridade" }).click();
  await page.getByRole("option", { name: "Urgente", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Filtrar.*1/ })).toBeVisible();

  await filters.getByRole("combobox", { name: "Faixa etária" }).click();
  await page
    .getByRole("option", { name: "60 anos ou mais", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Roberto Souza Lima");
  await expect(page.getByText("Página 1 de 1")).toBeVisible();

  await filters.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Filtrar" })).toBeVisible();
});

test("selects portaledos ficam acima dos overlays e modais", async ({
  page,
}) => {
  await page.goto("/recepcao?dev=recepcionista");

  await page.getByRole("button", { name: "Filtrar" }).click();
  const filters = page.getByRole("dialog", {
    name: "Filtros avançados da fila",
  });
  await filters.getByRole("combobox", { name: "Prioridade" }).click();

  const filterPopover = page.locator(".select-popover");
  await expect(filterPopover).toBeVisible();
  expect(
    await filterPopover.evaluate((element) =>
      Number(getComputedStyle(element).zIndex),
    ),
  ).toBeGreaterThan(
    await page.evaluate(() =>
      Number(
        getComputedStyle(document.querySelector(".filter-popover")!).zIndex,
      ),
    ),
  );
  await page.getByRole("option", { name: "Urgente", exact: true }).click();
  await filters.getByRole("combobox", { name: "Prioridade" }).click();
  await page.getByRole("option", { name: "Todas", exact: true }).click();

  await page
    .locator("tr")
    .filter({ hasText: "Ana Beatriz Rocha" })
    .getByRole("button", { name: "Excluir paciente Ana Beatriz Rocha" })
    .click();
  const dialog = page.getByRole("alertdialog", {
    name: "Excluir paciente da fila?",
  });
  await dialog.getByRole("combobox", { name: "Motivo da exclusão" }).click();

  const modalPopover = page.locator(".select-popover");
  await expect(modalPopover).toBeVisible();
  expect(
    await modalPopover.evaluate((element) =>
      Number(getComputedStyle(element).zIndex),
    ),
  ).toBeGreaterThan(
    await page.evaluate(() =>
      Number(
        getComputedStyle(document.querySelector(".reevaluation-overlay")!)
          .zIndex,
      ),
    ),
  );
});

test("a navegação lateral mantém a sessão entre recepção e transmissão", async ({
  page,
}) => {
  let sessionChecks = 0;
  await page.route("**/auth/me", async (route: Route) => {
    sessionChecks++;
    await route.fulfill({
      status: 200,
      json: {
        user: {
          id: "recepcionista-1",
          name: "Operador da Recepção",
          login: "recepcao@clinica.test",
          role: "RECEPCIONISTA",
        },
      },
    });
  });
  await page.goto("/recepcao");
  await expect(
    page.getByRole("heading", {
      name: "Fila de Espera e Gestão de Prioridades",
    }),
  ).toBeVisible();
  const checksBeforeNavigation = sessionChecks;

  await page.getByRole("link", { name: "Painel TV Pública" }).click();
  await expect(page).toHaveURL("/transmissao");
  await expect(page.locator(".route-transition")).toHaveClass(/is-entering/);
  await expect(
    page.getByRole("heading", { name: "NENHUMA CHAMADA ATIVA" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Painel TV Pública" }),
  ).toHaveClass(/is-active/);

  await page.getByRole("link", { name: "Triagem & Fila" }).click();
  await expect(page).toHaveURL("/recepcao");
  await expect(
    page.getByRole("heading", {
      name: "Fila de Espera e Gestão de Prioridades",
    }),
  ).toBeVisible();
  expect(sessionChecks).toBe(checksBeforeNavigation);
});

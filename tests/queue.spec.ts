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

test("a navegação lateral mantém a sessão entre recepção e transmissão", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "Fila de Espera e Gestão de Prioridades" })).toBeVisible();
  const checksBeforeNavigation = sessionChecks;

  await page.getByRole("link", { name: "Painel TV Pública" }).click();
  await expect(page).toHaveURL("/transmissao");
  await expect(page.locator(".route-transition")).toHaveClass(/is-entering/);
  await expect(page.getByRole("heading", { name: "CHAMANDO AGORA" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Painel TV Pública" })).toHaveClass(/is-active/);

  await page.getByRole("link", { name: "Triagem & Fila" }).click();
  await expect(page).toHaveURL("/recepcao");
  await expect(page.getByRole("heading", { name: "Fila de Espera e Gestão de Prioridades" })).toBeVisible();
  expect(sessionChecks).toBe(checksBeforeNavigation);
});

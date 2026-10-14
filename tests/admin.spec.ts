import { expect, test } from "@playwright/test";

test("painel administrativo apresenta métricas, equipe e fila compartilhada", async ({
  page,
}) => {
  await page.goto("/admin?dev=admin");

  await expect(
    page.getByRole("heading", {
      name: "Painel Administrativo - Visão Geral do Pronto-Socorro",
    }),
  ).toBeVisible();
  await expect(page.locator(".admin-kpi-value").first()).toContainText("5");
  await expect(page.getByText("1 Urgente", { exact: false })).toBeVisible();
  await expect(page.getByText("Roberto Souza Lima")).toBeVisible();
  await expect(page.getByText("Consultório 04")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Auditoria e Conformidade Sanitária" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Painel Administrativo" }),
  ).toHaveClass(/is-active/);
  await expect(page.locator(".header-context")).toContainText(
    "PRONTO-SOCORRO CENTRAL",
  );

  await page.getByRole("button", { name: "Usuários" }).click();
  await expect(page.getByRole("button", { name: "Usuários" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Gestão de Usuários e Equipe" }),
  ).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar Relatório Diário" }).click();
  expect((await download).suggestedFilename()).toBe(
    "relatorio-diario-pronto-socorro.csv",
  );
});

test("itens do menu lateral navegam de ida e volta para o painel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1228, height: 864 });
  await page.goto("/admin?dev=admin");
  const destinations = [
    ["Triagem & Fila", "/recepcao"],
    ["Novo Cadastro", "/novo-cadastro"],
    ["Consultório Médico", "/medico"],
    ["Painel TV Pública", "/transmissao"],
  ] as const;

  for (const [label, pathname] of destinations) {
    await page.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${pathname}(\\?|$)`));
    await expect(page.locator(".header-context")).toContainText(
      "PRONTO-SOCORRO CENTRAL",
    );
    await expect(page.getByRole("link", { name: label }).first()).toHaveClass(
      /is-active/,
    );

    await page.getByRole("link", { name: "Painel Administrativo" }).click();
    await expect(page).toHaveURL(/\/admin\?dev=admin$/);
    await expect(
      page.getByRole("heading", {
        name: "Painel Administrativo - Visão Geral do Pronto-Socorro",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Painel Administrativo" }),
    ).toHaveClass(/is-active/);
  }
});

test("sair encerra a sessão e retorna ao login", async ({ page }) => {
  await page.route("**/auth/logout", (route) => route.fulfill({ status: 204 }));
  await page.goto("/admin?dev=admin");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("sair do modo local retorna ao login sem depender do backend", async ({
  page,
}) => {
  let logoutRequested = false;
  await page.route("**/auth/logout", async (route) => {
    logoutRequested = true;
    await route.fulfill({ status: 503 });
  });
  await page.goto("/admin?dev=admin");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(logoutRequested).toBe(false);
});

import { expect, test } from "@playwright/test";

test("gera prioridade e adiciona o paciente à fila pela navegação", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/novo-cadastro?dev=recepcionista");

  await expect(page).toHaveTitle("Novo Cadastro e Triagem Rápida | Agora Você");
  await expect(page.getByRole("link", { name: "Novo Cadastro" })).toHaveClass(/is-active/);
  await expect(page.locator(".nc-ticket-number")).toHaveText("U-042");
  await expect(page.getByText("• Estado Febril")).toBeVisible();
  await expect(page.getByText("8 / 10", { exact: true })).toBeVisible();
  await expect(page.getByText("Dor intensa", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Gerar Prioridade Automática" }).click();
  await expect(page.getByRole("button", { name: "Confirmar e Adicionar à Fila" })).toBeEnabled();
  await page.getByRole("button", { name: "Confirmar e Adicionar à Fila" }).click();
  await expect(page.getByRole("status")).toContainText("Paciente cadastrado");
  await expect(page.locator(".nc-ticket-number")).toHaveText("U-042");

  await page.getByRole("link", { name: "Triagem & Fila" }).click();
  await expect(page).toHaveURL(/\/recepcao\?dev=recepcionista$/);
  await expect(page.getByText("Carlos Eduardo da Silva")).toBeVisible();
  await expect(page.locator(".total-card strong")).toHaveText("17");
});

test("link do menu abre a nova rota em desenvolvimento sem sessão da API", async ({ page }) => {
  await page.goto("/recepcao?dev=recepcionista");
  await page.getByRole("link", { name: "Novo Cadastro" }).click();

  await expect(page).toHaveURL(/\/novo-cadastro\?dev=recepcionista$/);
  await expect(page.getByRole("heading", { name: "Novo Cadastro e Triagem Rápida" })).toBeVisible();
});

test("formulário de cadastro não cria overflow horizontal em mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/novo-cadastro?dev=recepcionista");

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    overflowing: [...document.querySelectorAll("body *")]
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === "string" ? element.className : "",
        right: Math.round(element.getBoundingClientRect().right),
      }))
      .filter((element) => element.right > document.documentElement.clientWidth + 1),
  }));

  expect(layout.scrollWidth, JSON.stringify(layout.overflowing)).toBeLessThanOrEqual(layout.viewportWidth);
});

test("menu preserva a sessão ao navegar para novo cadastro autenticado", async ({ page }) => {
  await page.route("**/auth/me", async (route) => {
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

  await page.getByRole("link", { name: "Novo Cadastro" }).click();
  await expect(page).toHaveURL("/novo-cadastro");
  await expect(page.getByRole("heading", { name: "Novo Cadastro e Triagem Rápida" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Novo Cadastro" })).toHaveClass(/is-active/);
});

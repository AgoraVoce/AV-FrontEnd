import { expect, test } from "@playwright/test";

test("cadastro aceita e-mail válido e rejeita entradas inválidas antes da API", async ({ page }) => {
  // Isolamento: este teste nunca altera contas no servidor real.
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "UNMOCKED_ENDPOINT" } },
    }),
  );
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 200,
      json: {
        accessToken: "token-do-teste",
        tokenType: "Bearer",
        expiresIn: 900,
        user: {
          id: "97d4962f-c7cc-4a59-8f25-5e3d1a296ec5",
          name: "Admin de Teste",
          email: "admin@clinica.test",
          role: "ADMIN",
        },
      },
    }),
  );

  let created = 0;
  await page.route("**/api/v1/employees?*", (route) =>
    route.fulfill({
      json: { items: [], page: 1, pageSize: 10, total: 0 },
    }),
  );
  await page.route("**/api/v1/employees", (route) => {
    created++;
    expect(route.request().postDataJSON()).toEqual({
      name: "Médico Dois",
      email: "medicodois@gmail.com",
      password: "senhaSegura123",
      role: "MEDICO",
    });
    return route.fulfill({
      status: 201,
      json: {
        id: "ef18ca6f-c68f-4748-ae75-653d188287f5",
        name: "Médico Dois",
        email: "medicodois@gmail.com",
        role: "MEDICO",
        active: true,
      },
    });
  });

  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@clinica.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL("/admin");

  await page.getByRole("link", { name: "Novo funcionário" }).click();
  await page.getByLabel("Nome completo").fill("Médico Dois");
  await page.getByLabel("Senha inicial").fill("senhaSegura123");
  await page.getByLabel("E-mail corporativo").fill("medicodois@gmail");

  await page.getByRole("button", { name: /Cadastrar funcionário/ }).click();
  await expect(page.getByRole("alert")).toContainText("e-mail válido");
  expect(created).toBe(0);

  await page.getByLabel("E-mail corporativo").fill("medicodois@gmail.com");
  await page.getByLabel("Senha inicial").fill("curta");
  await page.getByRole("button", { name: /Cadastrar funcionário/ }).click();
  await expect(page.getByRole("alert")).toContainText("8 caracteres");
  expect(created).toBe(0);

  await page.getByLabel("Senha inicial").fill("senhaSegura123");
  await page.getByRole("button", { name: /Cadastrar funcionário/ }).click();

  await expect(page).toHaveURL("/admin/usuarios");
  expect(created).toBe(1);
});

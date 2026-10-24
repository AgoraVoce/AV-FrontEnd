import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("usuários têm página própria com pesquisa, filtro e cadastro de demonstração", async ({ page }) => {
  await page.goto("/admin/usuarios?dev=admin");
  await expect(page.getByRole("heading", { name: "Gestão de Usuários e Equipe" })).toBeVisible();
  await page.getByRole("combobox", { name: "Filtrar função" }).selectOption("medico");
  await expect(page.locator(".admin-section-table tbody tr")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Filtrar função" }).selectOption("todos");
  await page.getByRole("searchbox", { name: "Buscar profissionais" }).fill("Camila");
  await expect(page.locator(".admin-section-table tbody tr")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Buscar profissionais" }).fill("");

  await page.getByRole("button", { name: "Adicionar usuário" }).click();
  const functionSelect = page.getByRole("combobox", { name: "Função", exact: true });
  await expect(functionSelect).toBeVisible();
  await expect(page.locator(".admin-section-form-grid select")).toHaveCount(0);
  await functionSelect.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("listbox").getByRole("option", { name: "Médico" })).toBeVisible();
  await expect(page.getByRole("listbox").getByRole("option", { name: "Recepcionista" })).toBeVisible();
  await expect(page.getByRole("listbox").getByRole("option", { name: "Administrador" })).toBeVisible();
  await page.getByRole("listbox").getByRole("option", { name: "Administrador" }).click();
  await expect(functionSelect).toContainText("Administrador");
  await page.getByLabel("Nome completo").fill("Patrícia Almeida");
  await page.getByLabel("Registro / matrícula").fill("MAT-100");
  await page.getByLabel("Setor / local").fill("Recepção 02");
  await page.getByRole("button", { name: "Adicionar à lista local" }).click();
  await expect(page.getByText("Patrícia Almeida")).toBeVisible();
  await expect(page.getByText("5 de 5 profissionais exibidos")).toBeVisible();
  await page.getByRole("button", { name: "Desativar" }).last().click();
  await expect(page.getByRole("button", { name: "Reativar" })).toBeVisible();
});

test("recepcionista cadastra somente médico ou recepcionista usando select acessível", async ({ page }) => {
  await page.goto("/recepcao/usuarios?dev=recepcionista");
  await expect(page.getByRole("heading", { name: "Gestão de Usuários e Equipe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gestão de Usuários" })).toBeVisible();
  await expect(page.getByText("Lucas Vasconcelos")).toHaveCount(0);
  await page.getByRole("button", { name: "Adicionar usuário" }).click();
  const functionSelect = page.getByRole("combobox", { name: "Função", exact: true });
  await functionSelect.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
  await expect(page.getByRole("listbox").getByRole("option", { name: "Administrador" })).toHaveCount(0);
  await page.getByRole("listbox").getByRole("option", { name: "Recepcionista" }).click();
  await expect(functionSelect).toContainText("Recepcionista");
  await functionSelect.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(functionSelect).toHaveAttribute("aria-expanded", "false");

  await page.getByLabel("Nome completo").fill("Joana Oliveira");
  await page.getByLabel("Registro / matrícula").fill("REC-001");
  await page.getByLabel("Setor / local").fill("Recepção 02");
  await page.getByRole("button", { name: "Adicionar à lista local" }).click();
  await expect(page.getByText("Joana Oliveira")).toBeVisible();
  await expect(page.getByRole("button", { name: "Desativar" })).toHaveCount(0);
  await expect(page.getByText("4 de 4 profissionais exibidos")).toBeVisible();
});

test("médico não tem cadastro; médico não pode entrar em gestão administrativa", async ({ page }) => {
  await page.route("**/auth/me", route => route.fulfill({ status: 401, json: {} }));
  await page.goto("/medico?dev=medico");
  await expect(page.getByRole("link", { name: "Gestão de Usuários" })).toHaveCount(0);
  await page.goto("/recepcao/usuarios?dev=medico");
  await expect(page).toHaveURL(/\/login$/);

  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      json: { user: { id: "med-1", name: "Dr. Teste", login: "medico@clinica.test", role: "MEDICO" } },
    }),
  );
  await page.goto("/recepcao/usuarios");
  await expect(page.getByRole("heading", { name: "Esta área não está disponível para seu perfil." })).toBeVisible();
});

test("recepcionista autenticado não consegue entrar no cadastro de administradores", async ({ page }) => {
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      json: { user: { id: "rec-1", name: "Teste Recepção", login: "rec@clinica.test", role: "RECEPCIONISTA" } },
    }),
  );
  await page.goto("/admin/usuarios");
  await expect(page.getByRole("heading", { name: "Esta área não está disponível para seu perfil." })).toBeVisible();
});

test("fila administrativa permite pesquisar e filtrar a fila compartilhada", async ({ page }) => {
  await page.goto("/admin/fila?dev=admin");
  await expect(page.getByRole("heading", { name: "Fila de Espera" })).toBeVisible();
  await expect(page.getByText("5", { exact: true }).first()).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar pacientes" }).fill("Maria Clara Santos");
  await expect(page.locator(".admin-section-table tbody tr")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Filtrar prioridade da fila" }).selectOption("alert");
  await expect(page.locator(".admin-section-empty")).toContainText("Nenhum paciente");
  await page.getByRole("searchbox", { name: "Buscar pacientes" }).fill("");
  await page.getByRole("combobox", { name: "Filtrar prioridade da fila" }).selectOption("todas");
  await page.getByRole("combobox", { name: "Filtrar situação da fila" }).selectOption("in-care");
  await expect(page.locator(".admin-section-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".admin-section-table")).toContainText("Roberto Souza Lima");
});

test("relatórios exibem indicadores da sessão e CSV sem dados pessoais", async ({ page }) => {
  await page.goto("/admin/relatorios?dev=admin");
  await expect(page.getByRole("heading", { name: "Relatórios Operacionais" })).toBeVisible();
  await expect(page.getByText("Retrato da sessão local - dados simulados")).toHaveCount(0);
  await expect(page.locator(".admin-report-bar-row")).toHaveCount(3);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("relatorio-diario-pronto-socorro.csv");
  const fileContent = await readFile(await download.path(), "utf8");
  expect(fileContent).toContain("Pacientes em espera");
  expect(fileContent).not.toContain("Maria Clara Santos");
  expect(fileContent).not.toContain("Roberto Souza Lima");
});

test("rotas administrativas exigem sessão válida fora do modo de desenvolvimento", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto("/admin/usuarios");
  await expect(page).toHaveURL(/\/login$/);
});

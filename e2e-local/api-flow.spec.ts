import { expect, test, type Page } from "@playwright/test";

const account = { id: "97d4962f-c7cc-4a59-8f25-5e3d1a296ec5", name: "Equipe Teste", email: "equipe@clinica.test" };
async function login(page: Page, role: "RECEPCIONISTA" | "MEDICO" | "ADMIN") {
  await page.route("**/api/v1/auth/login", async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({ email: account.email, password: "senha-de-teste" });
    await route.fulfill({ status: 200, json: {
      accessToken: "jwt-de-teste-no-navegador", tokenType: "Bearer", expiresIn: 900,
      user: { ...account, role },
    } });
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
}
test("login real da API, Bearer e fila de espera da recepção", async ({ page }) => {
  await page.route("**/api/v1/queues/waiting", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer jwt-de-teste-no-navegador");
    await route.fulfill({ json: { items: [
      { entryId: "entr-001", fullName: "Paciente da API", queueCode: null },
    ] } });
  });
  await login(page, "RECEPCIONISTA");
  await expect(page).toHaveURL("/recepcao");
  await expect(page.getByText("Paciente da API")).toBeVisible();
  await expect(page.getByText("Sem senha")).toBeVisible();
  await expect(page.getByText("Carlos Eduardo da Silva")).toHaveCount(0);
  await page.getByRole("button", { name: "Atualizar fila" }).click();
  await expect(page.getByText("Paciente da API")).toBeVisible();
});
test("paciente e entrada são persistidos em duas requisições distintas", async ({ page }) => {
  await page.route("**/api/v1/queues/waiting", (route) => route.fulfill({ json: { items: [] } }));
  let postedPatient = false;
  let postedEntry = false;
  await page.route("**/api/v1/patients", async (route) => {
    const data = route.request().postDataJSON();
    expect(data.fullName).toBe("Pessoa Teste");
    expect(data.cpf).toBe("52998224725");
    expect(route.request().headers().authorization).toContain("Bearer ");
    postedPatient = true;
    await route.fulfill({ status: 201, json: { id: "90e59e30-7cd7-44ec-9f09-84371c873acf", fullName: data.fullName, cpf: data.cpf } });
  });
  await page.route("**/api/v1/entries", async (route) => {
    const data = route.request().postDataJSON();
    expect(data).toMatchObject({ patientId: "90e59e30-7cd7-44ec-9f09-84371c873acf", severity: "AMARELO", symptomIds: [], otherSymptoms: "Dor de cabeça" });
    postedEntry = true;
    await route.fulfill({ status: 201, json: { id: "c6854b6a-1625-40bc-ac2a-d6bc737bd56b", status: "AGUARDANDO", enteredAt: "2026-10-17T20:00:00Z" } });
  });
  await login(page, "RECEPCIONISTA");
  await page.getByRole("link", { name: "Novo Cadastro" }).click();
  await page.getByLabel("Nome completo").fill("Pessoa Teste");
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByRole("button", { name: "Continuar para entrada" }).click();
  await expect(page.getByText("ID: 90e59e30-7cd7-44ec-9f09-84371c873acf")).toBeVisible();
  await page.getByLabel("Classificação informada pela recepção").selectOption("AMARELO");
  await page.getByLabel("Sintomas / queixa relatada").fill("Dor de cabeça");
  await page.getByRole("button", { name: "Confirmar entrada no servidor" }).click();
  await expect(page.getByText("Entrada registrada com sucesso")).toBeVisible();
  expect(postedPatient).toBe(true);
  expect(postedEntry).toBe(true);
});
test("admin cadastra funcionário com role do backend e não revela a senha", async ({ page }) => {
  let receivedRole = "";
  await page.route("**/api/v1/employees", async (route) => {
    const input = route.request().postDataJSON();
    receivedRole = input.role;
    expect(input).toEqual({ name: "Nova Médica", email: "medica@clinica.test", password: "senhaSegura123", role: "MEDICO" });
    await route.fulfill({ status: 201, json: {
      id: "ef18ca6f-c68f-4748-ae75-653d188287f5", name: input.name, email: input.email, role: input.role, active: true,
    } });
  });
  await login(page, "ADMIN");
  await expect(page).toHaveURL("/admin");
  await page.getByLabel("Nome completo").fill("Nova Médica");
  await page.getByLabel("E-mail corporativo").fill("medica@clinica.test");
  await page.getByLabel("Senha inicial").fill("senhaSegura123");
  await page.getByLabel("Perfil").selectOption("MEDICO");
  await page.getByRole("button", { name: "Criar conta no backend" }).click();
  await expect(page.getByRole("cell", { name: "Nova Médica" })).toBeVisible();
  await expect(page.getByText("senhaSegura123")).toHaveCount(0);
  expect(receivedRole).toBe("MEDICO");
});
test("médico só consulta a própria fila e mostra erro de autorização sem dados simulados", async ({ page }) => {
  await page.route("**/api/v1/queues/me", (route) => route.fulfill({ status: 403, json: { error: { code: "DOCTOR_PROFILE_UNAVAILABLE", message: "Doctor profile unavailable" } } }));
  await login(page, "MEDICO");
  await expect(page).toHaveURL("/medico");
  await expect(page.getByRole("alert")).toContainText("cadastro médico");
  await expect(page.getByText("Dr. Marcelo Arantes")).toHaveCount(0);
});
test("401 encerra sessão no front e volta ao login", async ({ page }) => {
  await page.route("**/api/v1/queues/waiting", (route) => route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "Authentication required" } } }));
  await login(page, "RECEPCIONISTA");
  await expect(page).toHaveURL("/login");
});

import { expect, test, type Page } from "@playwright/test";
import {
  clinicDate,
  validPatientCpf,
  validatePatientRegistration,
} from "../src/integrations/patient-registration";

async function setup(page: Page) {
  const payloads: Record<string, unknown>[] = [];
  let mode = "success";
  let entered = false;
  const entryId = "registration-entry",
    patientId = "registration-patient";
  await page.clock.install({ time: new Date("2026-10-24T15:00:00Z") });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path.endsWith("/auth/login"))
      return route.fulfill({
        json: {
          accessToken: "registration-test",
          tokenType: "Bearer",
          expiresIn: 900,
          user: {
            id: "registration-user",
            name: "Recepção Teste",
            email: "registration@test.test",
            role: "RECEPCIONISTA",
          },
        },
      });
    if (path.endsWith("/queues/waiting"))
      return route.fulfill({
        json: {
          items: entered
            ? [{ entryId, fullName: "Paciente de Teste", queueCode: null }]
            : [],
        },
      });
    if (path.endsWith("/doctors"))
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pageSize: 100 },
      });
    if (path.endsWith("/patients") && route.request().method() === "POST") {
      const data = route.request().postDataJSON();
      payloads.push(data);
      if (mode === "duplicate")
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: "PATIENT_ALREADY_EXISTS",
              message: "Patient already exists",
            },
          },
        });
      if (mode === "validation")
        return route.fulfill({
          status: 400,
          json: {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request",
              details: [{ field: "email", message: "Invalid value" }],
            },
          },
        });
      if (mode === "unavailable")
        return route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
        });
      return route.fulfill({
        status: 201,
        json: { id: patientId, fullName: data.fullName, cpf: data.cpf },
      });
    }
    if (path.endsWith("/entries") && route.request().method() === "POST") {
      if (mode === "active-entry")
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: "ACTIVE_ENTRY_ALREADY_EXISTS",
              message: "Already active",
            },
          },
        });
      entered = true;
      return route.fulfill({
        status: 201,
        json: {
          id: entryId,
          status: "AGUARDANDO",
          enteredAt: "2026-10-24T15:00:00Z",
        },
      });
    }
    if (path.endsWith("/entries/" + entryId))
      return route.fulfill({
        json: {
          id: entryId,
          patientId,
          status: "waiting",
          severity: "VERDE",
          symptomIds: [],
          otherSymptoms: "Queixa relatada para teste",
          enteredAt: "2026-10-24T15:00:00Z",
          patient: {
            id: patientId,
            fullName: "Paciente de Teste",
            birthDate: "2000-01-01",
          },
        },
      });
    return route.fulfill({
      status: 503,
      json: { error: { code: "UNMOCKED_ENDPOINT" } },
    });
  });
  await page.goto("/login");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("registration@test.test");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Fila de Espera e Gestão de Prioridades",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Novo Cadastro", exact: true }).click();
  async function fill() {
    await page
      .getByRole("textbox", { name: "Nome completo *", exact: true })
      .fill("Paciente de Teste");
    await page
      .getByRole("textbox", { name: "CPF *", exact: true })
      .fill("529.982.247-25");
  }
  return {
    payloads,
    fill,
    setMode: (value: string) => {
      mode = value;
    },
  };
}

test("validação de CPF e nascimento segue as regras do backend e a data civil", () => {
  expect(validPatientCpf("52998224725")).toBe(true);
  expect(validPatientCpf("529.982.247-25")).toBe(true);
  expect(validPatientCpf("52998224726")).toBe(false);
  expect(validPatientCpf("11111111111")).toBe(false);
  expect(clinicDate(new Date("2026-10-24T01:00:00Z"))).toBe("2026-10-23");
  const data = {
    fullName: "Paciente",
    cpf: "52998224725",
    birthDate: "2026-10-24",
    phone: "",
    email: "",
  };
  expect(
    validatePatientRegistration(data, new Date("2026-10-24T01:00:00Z"))
      .birthDate,
  ).toBeTruthy();
  expect(
    validatePatientRegistration({ ...data, birthDate: "2000-02-30" }).birthDate,
  ).toBeTruthy();
});

test("CPF inválido é destacado sem enviar cadastro; correção libera o fluxo", async ({
  page,
}) => {
  const controls = await setup(page);
  await controls.fill();
  await page
    .getByRole("textbox", { name: "CPF *", exact: true })
    .fill("11111111111");
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(page.locator("#patient-cpf-error")).toContainText(
    "CPF inválido",
  );
  await expect(
    page.getByRole("textbox", { name: "CPF *", exact: true }),
  ).toBeFocused();
  expect(controls.payloads).toHaveLength(0);
  await page
    .getByRole("textbox", { name: "CPF *", exact: true })
    .fill("52998224725");
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Registrar entrada", exact: true }),
  ).toBeVisible();
  expect(controls.payloads).toHaveLength(1);
});

test("CPF duplicado explica como usar paciente existente e preserva formulário", async ({
  page,
}) => {
  const controls = await setup(page);
  controls.setMode("duplicate");
  await controls.fill();
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(page.locator("#patient-cpf-error")).toContainText(
    "Já existe um paciente com este CPF",
  );
  await expect(
    page.getByRole("textbox", { name: "Nome completo *", exact: true }),
  ).toHaveValue("Paciente de Teste");
  await expect(
    page.getByRole("link", { name: "Buscar paciente existente" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "CPF *", exact: true }),
  ).toBeFocused();
});

test("API informa campo inválido e falha de serviço permite nova tentativa sem perder dados", async ({
  page,
}) => {
  const controls = await setup(page);
  await controls.fill();
  controls.setMode("validation");
  await page
    .getByRole("textbox", { name: "E-mail", exact: true })
    .fill("patient@example.test");
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(page.locator("#patient-email-error")).toContainText(
    "e-mail válido",
  );
  await expect(
    page.getByRole("textbox", { name: "E-mail", exact: true }),
  ).toHaveValue("patient@example.test");
  controls.setMode("unavailable");
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(page.locator(".av-toast.is-error").last()).toContainText(
    "Não foi possível concluir",
  );
  controls.setMode("success");
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Registrar entrada", exact: true }),
  ).toBeVisible();
});

test("cadastro válido normaliza CPF e permite registrar entrada com espera iniciando em zero", async ({
  page,
}) => {
  const controls = await setup(page);
  await controls.fill();
  await page
    .getByLabel("Data de nascimento", { exact: true })
    .fill("2000-01-01");
  await page
    .getByRole("textbox", { name: "Telefone", exact: true })
    .fill("11999999999");
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Registrar entrada", exact: true }),
  ).toBeVisible();
  expect(controls.payloads[0]).toMatchObject({
    fullName: "Paciente de Teste",
    cpf: "52998224725",
    birthDate: "2000-01-01",
    phone: "11999999999",
  });
  await page
    .getByRole("textbox", { name: "Sintomas / queixa relatada *", exact: true })
    .fill("Queixa relatada para teste");
  await page
    .getByRole("button", { name: "Confirmar entrada no servidor" })
    .click();
  await expect(
    page.locator(
      'tr[data-priority-entry="registration-entry"] .reception-wait',
    ),
  ).toContainText("0 min");
});

test("entrada já ativa mostra erro persistente e não repete cadastro pessoal", async ({
  page,
}) => {
  const controls = await setup(page);
  await controls.fill();
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Registrar entrada", exact: true }),
  ).toBeVisible();
  controls.setMode("active-entry");
  await page
    .getByRole("textbox", { name: "Sintomas / queixa relatada *", exact: true })
    .fill("Queixa relatada para teste");
  await page
    .getByRole("button", { name: "Confirmar entrada no servidor" })
    .click();
  await expect(page.locator(".local-message.is-error")).toContainText(
    "já possui uma entrada ativa",
  );
  expect(controls.payloads).toHaveLength(1);
  await expect(
    page.getByRole("textbox", {
      name: "Sintomas / queixa relatada *",
      exact: true,
    }),
  ).toHaveValue("Queixa relatada para teste");
});

test("nome do paciente não aceita e-mail da conta e campos não reutilizam autofill de login", async ({
  page,
}) => {
  const controls = await setup(page);
  await controls.fill();
  const name = page.getByRole("textbox", {
    name: "Nome completo *",
    exact: true,
  });
  await name.fill("registration@test.test");
  await expect(name).toHaveAttribute("autocomplete", "off");
  await expect(name).toHaveAttribute("name", "patient-fullName");
  await expect(
    page.getByRole("textbox", { name: "E-mail", exact: true }),
  ).toHaveAttribute("autocomplete", "off");
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(page.locator("#patient-fullName-error")).toContainText(
    "este campo não aceita e-mail",
  );
  await expect(name).toBeFocused();
  expect(controls.payloads).toHaveLength(0);
  await name.fill("Nome Correto do Paciente");
  await page.getByRole("button", { name: "Cadastrar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Registrar entrada", exact: true }),
  ).toBeVisible();
  expect(controls.payloads[0].fullName).toBe("Nome Correto do Paciente");
  await expect(
    page.getByText("Paciente: Nome Correto do Paciente"),
  ).toBeVisible();
});

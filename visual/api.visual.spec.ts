import { expect, test, type Page } from "@playwright/test";
import { captureScreen, trackPageErrors } from "./capture";
import { installApiFixtures, visualAccount, entryId, patientId, type VisualRole } from "./fixtures";

// Live-mode routes and meaningful screen states. No real patient, credentials,
// production API or backend database are ever accessed.
type Screen = {
  id: string;
  path: string;
  role?: VisualRole;
  state?: "details" | "search-patient" | "select-patient" |
    "called" | "attending" | "prescribing" | "review" | "completed" | "new-employee";
};

const screens: Screen[] = [
  { id: "login", path: "/login" },
  { id: "recuperar-senha-indisponivel", path: "/recuperar-senha" },
  { id: "transmissao-indisponivel", path: "/transmissao" },
  { id: "tv-publica-indisponivel", path: "/transmissao/tv" },
  { id: "pagina-nao-encontrada", path: "/pagina-inexistente" },
  { id: "recepcao-fila", path: "/recepcao", role: "RECEPCIONISTA" },
  { id: "recepcao-detalhes", path: "/recepcao", role: "RECEPCIONISTA", state: "details" },
  { id: "recepcao-usuarios-restrito", path: "/recepcao/usuarios", role: "RECEPCIONISTA" },
  { id: "pacientes-lista", path: "/pacientes", role: "RECEPCIONISTA" },
  { id: "pacientes-busca", path: "/pacientes", role: "RECEPCIONISTA", state: "search-patient" },
  { id: "novo-cadastro-formulario", path: "/novo-cadastro", role: "RECEPCIONISTA" },
  { id: "novo-cadastro-entrada", path: "/novo-cadastro?patient=" + patientId, role: "RECEPCIONISTA", state: "select-patient" },
  { id: "medico-dashboard", path: "/medico", role: "MEDICO" },
  { id: "medico-fila", path: "/medico/fila", role: "MEDICO" },
  { id: "medico-detalhes-paciente", path: "/medico/fila/" + entryId, role: "MEDICO" },
  { id: "medico-paciente-chamado", path: "/medico", role: "MEDICO", state: "called" },
  { id: "medico-atendimento", path: "/medico", role: "MEDICO", state: "attending" },
  { id: "medico-prescricao", path: "/medico", role: "MEDICO", state: "prescribing" },
  { id: "medico-revisao-finalizacao", path: "/medico", role: "MEDICO", state: "review" },
  { id: "medico-atendimento-concluido", path: "/medico", role: "MEDICO", state: "completed" },
  { id: "admin-funcionarios", path: "/admin", role: "ADMIN" },
  { id: "admin-novo-funcionario", path: "/admin/novo-funcionario", role: "ADMIN" },
  { id: "admin-usuarios", path: "/admin/usuarios", role: "ADMIN" },
  { id: "admin-fila-indisponivel", path: "/admin/fila", role: "ADMIN" },
  { id: "admin-relatorios-indisponivel", path: "/admin/relatorios", role: "ADMIN" },
];

const startByRole: Record<VisualRole, string> = {
  RECEPCIONISTA: "/recepcao",
  MEDICO: "/medico",
  ADMIN: "/admin",
};

async function enterAs(page: Page, role: VisualRole) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(visualAccount.email);
  await page.getByLabel("Senha", { exact: true }).fill(visualAccount.password);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL(startByRole[role]);
}

// Use client-side navigation to preserve the deliberately memory-only JWT.
async function navigateTo(page: Page, route: string) {
  if (new URL(page.url()).pathname + new URL(page.url()).search === route) return;
  await page.evaluate((path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, route);
  await expect(page).toHaveURL(route);
}

async function prepareState(page: Page, screen: Screen) {
  switch (screen.state) {
    case "details":
      await page.getByRole("button", { name: "Ver detalhes" }).first().click();
      await expect(page.getByRole("region", { name: "Detalhes da entrada" })).toContainText("Paciente de Demonstração");
      break;
    case "search-patient":
      await page.getByLabel("Buscar paciente por nome ou CPF").fill("Paciente");
      await expect(page.getByRole("link", { name: /Paciente de Demonstração/ })).toBeVisible();
      break;
    case "select-patient":
      await expect(page.getByLabel("Médico de plantão")).toBeVisible();
      await page.getByLabel("Classificação informada pela recepção").selectOption("AMARELO");
      await page.getByLabel("Médico de plantão").selectOption("66666666-6666-4666-8666-666666666666");
      await page.getByLabel("Sintomas / queixa relatada").fill("Dor de cabeça e tontura. Dados fictícios.");
      break;
    case "called":
    case "attending":
    case "prescribing":
    case "review":
    case "completed":
      await page.getByRole("button", { name: "Chamar próximo paciente" }).click();
      await expect(page).toHaveURL("/medico/atendimento");
      await expect(page.getByRole("status").getByText("Paciente chamado")).toBeVisible();
      if (screen.state === "called") break;
      await page.getByRole("button", { name: /Iniciar atendimento/ }).click();
      await expect(page.getByRole("button", { name: /Prescrever e finalizar/ })).toBeVisible();
      if (screen.state === "attending") break;
      await page.getByRole("button", { name: /Prescrever e finalizar/ }).click();
      await expect(page.getByRole("heading", { name: "Prescrição e finalização" })).toBeVisible();
      await page.getByLabel("Descrição / conduta clínica").fill("Registro de conduta com dados fictícios.");
      await page.getByLabel(/^Nome/).fill("Medicamento demonstrativo");
      await page.getByLabel("Dosagem").fill("1 unidade");
      await page.getByLabel("Instruções").fill("Orientações fictícias para teste de interface.");
      if (screen.state === "prescribing") break;
      await page.getByRole("button", { name: "Revisar e finalizar" }).click();
      await expect(page.getByText("Revisar antes de finalizar")).toBeVisible();
      if (screen.state === "review") break;
      await page.getByRole("button", { name: "Confirmar finalização" }).click();
      await expect(page.getByRole("status").getByText("Atendimento finalizado")).toBeVisible();
      break;
    default:
      break;
  }
}

for (const screen of screens) {
  test("API simulada / " + screen.id, async ({ page }, info) => {
    const errors = trackPageErrors(page);
    await page.clock.setFixedTime(new Date("2026-10-19T15:30:00-03:00"));
    const fixtures = await installApiFixtures(page, screen.role || "RECEPCIONISTA");
    if (screen.role) {
      await enterAs(page, screen.role);
      await navigateTo(page, screen.path);
    } else {
      await page.goto(screen.path);
    }
    await expect(page.locator("h1:visible, h2:visible").first()).toBeVisible();
    await prepareState(page, screen);
    await captureScreen(page, info, "api", screen.id, errors);
    expect(fixtures.unexpected, "Todas as chamadas da API devem estar simuladas").toEqual([]);
  });
}

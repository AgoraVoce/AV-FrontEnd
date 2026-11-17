import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const account = {
  id: "97d4962f-c7cc-4a59-8f25-5e3d1a296ec5",
  name: "Equipe Teste",
  email: "medico@clinica.test",
  role: "MEDICO",
};
const entryId = "c6854b6a-1625-40bc-ac2a-d6bc737bd56b";
const patientId = "90e59e30-7cd7-44ec-9f09-84371c873acf";
const doctorId = "4b0e8bcb-fd78-4719-a53b-a227998095d4";
let unexpectedRequests: string[];

test.beforeEach(async ({ page }) => {
  unexpectedRequests = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://localhost:5182") {
      unexpectedRequests.push(
        `${route.request().method()} ${url.origin}${url.pathname}`,
      );
      await route.fulfill({
        status: 599,
        body: "External request blocked by prescription fixture",
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/v1/**", async (route) => {
    unexpectedRequests.push(
      `${route.request().method()} ${new URL(route.request().url()).pathname}`,
    );
    await route.fulfill({
      status: 503,
      json: { error: { code: "UNMOCKED_ENDPOINT" } },
    });
  });
});

function entry(
  status: "called" | "in_progress" | "completed",
  prescription: unknown = null,
) {
  return {
    id: entryId,
    patientId,
    enteredAt: "2026-11-12T09:00:00.000Z",
    severity: "AMARELO",
    status,
    assignedDoctorId: doctorId,
    queueCode: "AV-042",
    otherSymptoms: "Queixa sintética para teste",
    shortNote: "Observação fictícia de entrada",
    symptomIds: ["e04723dc-96e6-48dc-8cb8-462c6811c203"],
    queuePosition: null,
    patient: { id: patientId, fullName: "Paciente Sintético", birthDate: null },
    doctor: { id: doctorId, name: "Dra. Helena Teste" },
    room: "Sala de teste",
    timestamps: {
      enteredAt: "2026-11-12T09:00:00.000Z",
      calledAt: "2026-11-12T09:05:00.000Z",
      startedAt: "2026-11-12T09:10:00.000Z",
      finishedAt: status === "completed" ? "2026-11-12T09:35:00.000Z" : null,
    },
    prescription,
  };
}

async function login(page: Page) {
  await page.route("**/api/v1/auth/login", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: account.email,
      password: "senha-de-teste",
    });
    await route.fulfill({
      status: 200,
      json: {
        accessToken: "jwt-de-teste",
        tokenType: "Bearer",
        expiresIn: 900,
        user: account,
      },
    });
  });
  await page.route("**/api/v1/queues/me", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/v1/doctors/me/active", (route) =>
    route.fulfill({ json: entry("in_progress") }),
  );
  await page.route("**/api/v1/doctors/me/dashboard", (route) =>
    route.fulfill({
      json: {
        date: "2026-11-12",
        waiting: 0,
        called: 0,
        inProgress: 1,
        completedToday: 0,
        cancelledToday: 0,
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL("/medico");
}

async function openCurrentAppointment(page: Page) {
  await login(page);
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await expect(page.locator("h1", { hasText: "Paciente atual" })).toBeVisible();
  await expect(page.getByText("Paciente Sintético")).toBeVisible();
  await page.getByRole("button", { name: "Prescrever e finalizar" }).click();
}

function persistedPrescription(
  description: string,
  medications: unknown[] = [],
  notes?: string,
) {
  return {
    id: "67d159cc-59c3-41a8-b173-d8a21c789fa0",
    description,
    medications,
    notes: notes ?? null,
    createdAt: "2026-11-12T09:34:00.000Z",
  };
}

async function openHistoryDocumentLink(page: Page) {
  await page.route("**/api/v1/doctors/me/entries?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: entryId,
            patientId,
            enteredAt: "2026-11-12T09:00:00.000Z",
            status: "FINALIZADO",
            severity: "AMARELO",
            queueCode: "AV-042",
            patient: { id: patientId, fullName: "Paciente Sintético" },
            doctor: { id: doctorId, name: "Dra. Helena Teste" },
            attendance: {
              calledAt: null,
              startedAt: null,
              finishedAt: "2026-11-12T09:35:00.000Z",
              room: null,
            },
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
      },
    }),
  );
  await page
    .getByRole("link", { name: "Meus atendimentos", exact: true })
    .click();
  await page.getByRole("link", { name: "Ver prescrição" }).click();
}

test("finaliza sem medicamentos, mantém texto literal e abre impressão, PDF e e-mail indisponível", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as Window & { __printCount?: number }).__printCount = 0;
    window.print = () => {
      (window as Window & { __printCount?: number }).__printCount! += 1;
    };
  });
  await openCurrentAppointment(page);
  const description =
    'Conduta fictícia: <script>window.__xss = true</script> & aspas " ação \nsegunda linha';
  await expect(page.getByText("Nenhum medicamento adicionado.")).toBeVisible();
  await page.getByLabel(/Descrição \/ conduta clínica/).fill(description);
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  await expect(
    page.getByText("Pré-visualização — conteúdo não salvo"),
  ).toBeVisible();
  await expect(page.locator(".prescription-document-text").first()).toHaveText(
    description,
  );
  await expect(page.locator(".prescription-document script")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as Window & { __xss?: boolean }).__xss),
  ).toBeUndefined();

  await page.getByRole("button", { name: "Voltar para edição" }).click();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    description,
  );
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();

  let completionCount = 0;
  let completionBody: unknown;
  const confirmed = entry("completed", persistedPrescription(description));
  await page.route(`**/api/v1/entries/${entryId}/complete`, async (route) => {
    completionCount += 1;
    completionBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: confirmed });
  });
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({ json: confirmed }),
  );
  await page.getByRole("button", { name: "Confirmar finalização" }).dblclick();
  await expect(page).toHaveURL(`/medico/prescricoes/${entryId}`);
  await expect(
    page.getByText("Prescrição registrada", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".av-toast-stack .av-toast")).toHaveCount(0);
  expect(completionCount).toBe(1);
  expect(completionBody).toEqual({
    prescription: { description, medications: [] },
  });

  await expect(
    page.getByRole("button", { name: "Imprimir prescrição" }),
  ).toBeEnabled();
  const emailButton = page.getByRole("button", {
    name: "Enviar prescrição por e-mail",
  });
  await expect(emailButton).toBeDisabled();
  await expect(
    page.getByText("O envio depende de integração segura no servidor."),
  ).toBeVisible();
  await expect(page.getByText(/enviado/i)).toHaveCount(0);
  await expect(page.getByText("Sem medicamentos prescritos.")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect
    .poll(() =>
      page
        .locator(".site-header")
        .evaluate((node) => getComputedStyle(node).display),
    )
    .toBe("none");
  await expect
    .poll(() =>
      page
        .locator(".prescription-document")
        .evaluate((node) => getComputedStyle(node).display),
    )
    .toBe("block");
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Imprimir prescrição" }).click();
  expect(
    await page.evaluate(
      () => (window as Window & { __printCount?: number }).__printCount,
    ),
  ).toBe(1);

  await page.route(`**/api/v1/entries/${entryId}/prescription.pdf`, (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/pdf" },
      body: "%PDF-1.4\n%%EOF",
    }),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PDF" }).click();
  expect((await download).suggestedFilename()).toBe(
    `prescricao-${entryId}.pdf`,
  );
  expect(completionCount).toBe(1);
  const storage = await page.evaluate(() => ({
    local: Object.values(localStorage).join(" "),
    session: Object.values(sessionStorage).join(" "),
    history: JSON.stringify(history.state),
  }));
  expect(storage.local).not.toContain("Conduta fictícia");
  expect(storage.session).not.toContain("Conduta fictícia");
  expect(storage.history).not.toContain("Conduta fictícia");
  expect(unexpectedRequests).toEqual([]);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("valida campos em sequência e preserva rascunho ao voltar ao atendimento", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  const description = page.getByLabel(/Descrição \/ conduta clínica/);
  await expect(description).toBeFocused();
  await expect(description).toHaveAttribute("aria-invalid", "true");

  await description.fill("   ");
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  await expect(description).toBeFocused();
  const maximumDescription = "a".repeat(5000);
  await description.fill("a".repeat(5001));
  await expect(description).toHaveValue(maximumDescription);
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  await expect(page.locator(".prescription-document-text").first()).toHaveText(
    maximumDescription,
  );
  await page.getByRole("button", { name: "Voltar para edição" }).click();
  await description.fill("");
  await description.fill("Conduta sintética com medicação opcional.");
  await page.getByRole("button", { name: "Adicionar medicamento" }).click();
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  const medicationName = page.getByLabel("Nome *").nth(0);
  await expect(medicationName).toBeFocused();
  await expect(medicationName).toHaveAttribute("aria-invalid", "true");

  await medicationName.fill("Medicação fictícia");
  await page.getByLabel("Dosagem *").nth(0).fill("1 unidade");
  await page
    .getByLabel("Instruções *")
    .nth(0)
    .fill("Usar conforme indicação fictícia.");
  await page.getByRole("button", { name: "Adicionar medicamento" }).click();
  await page.getByLabel("Nome *").nth(1).fill("Segunda medicação fictícia");
  await page.getByLabel("Dosagem *").nth(1).fill("2 unidades");
  await page
    .getByLabel("Instruções *")
    .nth(1)
    .fill("Segunda orientação de teste.");
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  await expect(
    page.getByText("Segunda medicação fictícia", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar para edição" }).click();
  await page.getByLabel("Orientações adicionais").fill("Orientação de teste.");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Este rascunho não foi salvo no servidor",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(page).toHaveURL("/medico/atendimento");
  await page.getByRole("button", { name: "Voltar ao atendimento" }).click();
  await page.getByRole("button", { name: "Continuar rascunho" }).click();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    "Conduta sintética com medicação opcional.",
  );
  await expect(page.getByLabel("Nome *").nth(0)).toHaveValue(
    "Medicação fictícia",
  );
  await expect(page.getByLabel("Nome *").nth(1)).toHaveValue(
    "Segunda medicação fictícia",
  );
  await expect(page.getByLabel("Orientações adicionais")).toHaveValue(
    "Orientação de teste.",
  );
  await page.goBack();
  await expect(page).toHaveURL("/medico");
  await page.goForward();
  await expect(page).toHaveURL("/medico/atendimento");
  await page.getByRole("button", { name: "Continuar rascunho" }).click();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    "Conduta sintética com medicação opcional.",
  );
  expect(unexpectedRequests).toEqual([]);
});

test("Back do navegador durante a finalização não redireciona nem restaura rascunho depois da confirmação", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  await page
    .getByLabel(/Descrição \/ conduta clínica/)
    .fill("Conduta sintética com resposta tardia.");
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();

  let releaseResponse: (() => void) | undefined;
  let completionCount = 0;
  let responseHandled = false;
  let activeStatus: "in_progress" | "completed" = "in_progress";
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/v1/doctors/me/active", (route) =>
    route.fulfill({
      json: activeStatus === "completed" ? null : entry(activeStatus),
    }),
  );
  await page.route(`**/api/v1/entries/${entryId}/complete`, async (route) => {
    completionCount += 1;
    await responseGate;
    activeStatus = "completed";
    await route.fulfill({
      json: entry(
        "completed",
        persistedPrescription("Conduta sintética com resposta tardia."),
      ),
    });
    responseHandled = true;
  });
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({
      json: entry(
        "completed",
        persistedPrescription("Conduta sintética com resposta tardia."),
      ),
    }),
  );

  await page.getByRole("button", { name: "Confirmar finalização" }).click();
  await expect.poll(() => completionCount).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL("/medico");
  releaseResponse?.();
  await expect.poll(() => responseHandled).toBe(true);
  await expect(page).toHaveURL("/medico");
  await expect(page.getByText("Pronto para a próxima chamada")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Este rascunho não foi salvo no servidor",
    }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await expect(page).toHaveURL("/medico/atendimento");
  await expect(
    page.getByRole("button", { name: "Prescrever e finalizar" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continuar rascunho" }),
  ).toHaveCount(0);
  expect(completionCount).toBe(1);
  expect(unexpectedRequests).toEqual([]);
});

test("finalização 204 consulta a prescrição persistida antes de abrir o documento", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  await page
    .getByLabel(/Descrição \/ conduta clínica/)
    .fill("Conduta sintética confirmada por 204.");
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  let completionCount = 0;
  await page.route(`**/api/v1/entries/${entryId}/complete`, async (route) => {
    completionCount += 1;
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({
      json: entry(
        "completed",
        persistedPrescription("Conduta sintética confirmada por 204."),
      ),
    }),
  );
  await page.getByRole("button", { name: "Confirmar finalização" }).click();
  await expect(page).toHaveURL(`/medico/prescricoes/${entryId}`);
  await expect(
    page.getByRole("button", { name: "Imprimir prescrição" }),
  ).toBeVisible();
  expect(completionCount).toBe(1);
  expect(unexpectedRequests).toEqual([]);
});

test("limita a lista a 50 medicamentos e deixa descrição obrigatória até 5000 caracteres", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  const description = page.getByLabel(/Descrição \/ conduta clínica/);
  await expect(description).toHaveAttribute("maxlength", "5000");
  for (let index = 0; index < 50; index += 1)
    await page.getByRole("button", { name: "Adicionar medicamento" }).click();
  await expect(page.locator(".prescription-medication")).toHaveCount(50);
  await expect(
    page.getByRole("button", { name: "Adicionar medicamento" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Nome *").first()).toHaveAttribute(
    "maxlength",
    "150",
  );
  await expect(page.getByLabel("Dosagem *").first()).toHaveAttribute(
    "maxlength",
    "150",
  );
  await expect(page.getByLabel("Instruções *").first()).toHaveAttribute(
    "maxlength",
    "1000",
  );
  await expect(page.getByLabel("Orientações adicionais")).toHaveAttribute(
    "maxlength",
    "4000",
  );
  expect(unexpectedRequests).toEqual([]);
});

test("saída da sessão pede confirmação quando há conteúdo clínico em memória", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  await page
    .getByLabel(/Descrição \/ conduta clínica/)
    .fill("Rascunho fictício de sessão.");
  let logoutCount = 0;
  await page.route("**/api/v1/auth/logout", async (route) => {
    logoutCount += 1;
    await route.fulfill({ status: 204, body: "" });
  });

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Este rascunho não foi salvo no servidor",
    }),
  ).toBeVisible();
  expect(logoutCount).toBe(0);
  await page.getByRole("button", { name: "Continuar editando" }).click();
  expect(logoutCount).toBe(0);

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("button", { name: "Sair sem salvar" }).click();
  await expect(page).toHaveURL("/login");
  expect(logoutCount).toBe(1);
  expect(unexpectedRequests).toEqual([]);
});

test("sessão invalidada durante restauração limpa rascunho clínico em memória", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  await page
    .getByLabel(/Descrição \/ conduta clínica/)
    .fill("Rascunho sintético para sessão expirada.");
  let sessionChecks = 0;
  await page.route("**/api/v1/auth/me", async (route) => {
    sessionChecks += 1;
    await route.fulfill({
      status: 401,
      json: { error: { code: "UNAUTHENTICATED" } },
    });
  });
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page).toHaveURL("/login");
  expect(sessionChecks).toBe(1);
  expect(unexpectedRequests).toEqual([]);
});

test("mudança de contexto de autenticação limpa também o estado React do rascunho", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  await page
    .getByLabel(/Descrição \/ conduta clínica/)
    .fill("Rascunho sintético para troca de contexto.");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("av:auth-context-changed")),
  );
  await expect(
    page.getByRole("button", { name: "Prescrever e finalizar" }),
  ).toBeVisible();
  await expect(page.getByText(/Rascunho não salvo no servidor/)).toHaveCount(0);
  await page.getByRole("button", { name: "Prescrever e finalizar" }).click();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue("");
  expect(unexpectedRequests).toEqual([]);
});

test("falha 409 consulta o atendimento, preserva rascunho e bloqueia repetição cega", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  const description = "Conduta preservada após conflito fictício.";
  await page.getByLabel(/Descrição \/ conduta clínica/).fill(description);
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();

  let completionCount = 0;
  let detailReads = 0;
  await page.route(`**/api/v1/entries/${entryId}/complete`, async (route) => {
    completionCount += 1;
    await route.fulfill({
      status: 409,
      json: { error: { code: "ENTRY_STATE_CONFLICT" } },
    });
  });
  await page.route(`**/api/v1/entries/${entryId}`, async (route) => {
    detailReads += 1;
    if (detailReads === 1)
      await route.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE" } },
      });
    else await route.fulfill({ json: entry("in_progress") });
  });
  await page.getByRole("button", { name: "Confirmar finalização" }).click();
  await expect(
    page.getByText(/Resultado da finalização não confirmado/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verificar situação no servidor" }),
  ).toBeVisible();
  expect(completionCount).toBe(1);

  await page
    .getByRole("button", { name: "Verificar situação no servidor" })
    .click();
  await expect(page.getByText(/continua em andamento/)).toBeVisible();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    description,
  );
  await expect(
    page.getByRole("button", { name: "Confirmar finalização" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Revisar antes de finalizar" }),
  ).toBeEnabled();
  expect(completionCount).toBe(1);
  expect(unexpectedRequests).toEqual([]);
});

test("prévia salva tem múltiplas páginas A4 e reflow mobile sem imprimir o shell", async ({
  page,
}, testInfo) => {
  await login(page);
  const medicationList = Array.from({ length: 12 }, (_, index) => ({
    name: `Medicamento sintético ${index + 1}`,
    dosage: "1 unidade fictícia",
    instructions: "Orientação de impressão sintética. ".repeat(22),
  }));
  const longEntry = entry(
    "completed",
    persistedPrescription(
      "Conduta sintética para teste de paginação. ".repeat(110),
      medicationList,
      "Orientações adicionais sintéticas. ".repeat(100),
    ),
  );
  await page.route("**/api/v1/doctors/me/entries?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: entryId,
            patientId,
            enteredAt: "2026-11-12T09:00:00.000Z",
            status: "FINALIZADO",
            severity: "AMARELO",
            queueCode: "AV-042",
            patient: { id: patientId, fullName: "Paciente Sintético" },
            doctor: { id: doctorId, name: "Dra. Helena Teste" },
            attendance: {
              calledAt: null,
              startedAt: null,
              finishedAt: "2026-11-12T09:35:00.000Z",
              room: null,
            },
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
      },
    }),
  );
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({ json: longEntry }),
  );
  await page
    .getByRole("link", { name: "Meus atendimentos", exact: true })
    .click();
  await page.getByRole("link", { name: "Ver prescrição" }).click();
  await expect(
    page.getByRole("button", { name: "Imprimir prescrição" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll("body *"))
      .map((node) => ({
        node: `${node.tagName.toLowerCase()}.${(node as HTMLElement).className}`,
        right: node.getBoundingClientRect().right,
      }))
      .filter((item) => item.right > window.innerWidth + 1),
  );
  expect(overflow, JSON.stringify(overflow)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const screenshotPath = testInfo.outputPath("prescricao-preview-390.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("prescricao-preview-390.png", {
    path: screenshotPath,
    contentType: "image/png",
  });
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }

  await page.emulateMedia({ media: "print" });
  await expect
    .poll(() =>
      page
        .locator(".prescription-document")
        .evaluate((node) => getComputedStyle(node).page),
    )
    .toBe("prescription");
  const pdfPath = testInfo.outputPath("prescricao-sintetica-a4.pdf");
  const pdf = await page.pdf({
    path: pdfPath,
    printBackground: true,
    preferCSSPageSize: true,
  });
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? [])
    .length;
  expect(pageCount).toBeGreaterThanOrEqual(2);
  await testInfo.attach("prescricao-sintetica-a4.pdf", {
    path: pdfPath,
    contentType: "application/pdf",
  });
  expect(unexpectedRequests).toEqual([]);
});

test("histórico médico abre documento pelo entryId e estado não finalizado bloqueia impressão", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/doctors/me/entries?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: entryId,
            patientId,
            enteredAt: "2026-11-12T09:00:00.000Z",
            status: "FINALIZADO",
            severity: "AMARELO",
            queueCode: "AV-042",
            patient: { id: patientId, fullName: "Paciente Sintético" },
            doctor: { id: doctorId, name: "Dra. Helena Teste" },
            attendance: {
              calledAt: null,
              startedAt: null,
              finishedAt: "2026-11-12T09:35:00.000Z",
              room: null,
            },
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
      },
    }),
  );
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .getByRole("link", { name: "Meus atendimentos", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Ver prescrição" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({ json: entry("in_progress") }),
  );
  await page.getByRole("link", { name: "Ver prescrição" }).click();
  await expect(
    page.getByRole("heading", { name: "Prescrição ainda indisponível" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Prescrição registrada", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Imprimir prescrição" }),
  ).toHaveCount(0);
  expect(unexpectedRequests).toEqual([]);
});

test("prescrição com resposta malformada bloqueia o documento definitivo", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/v1/doctors/me/entries?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: entryId,
            patientId,
            enteredAt: "2026-11-12T09:00:00.000Z",
            status: "FINALIZADO",
            severity: "AMARELO",
            queueCode: "AV-042",
            patient: { id: patientId, fullName: "Paciente Sintético" },
            doctor: { id: doctorId, name: "Dra. Helena Teste" },
            attendance: {
              calledAt: null,
              startedAt: null,
              finishedAt: "2026-11-12T09:35:00.000Z",
              room: null,
            },
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
      },
    }),
  );
  await page
    .getByRole("link", { name: "Meus atendimentos", exact: true })
    .click();
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({
      json: entry("completed", {
        ...persistedPrescription(
          "Conduta sintética sem conteúdo clínico real.",
        ),
        notes: { malformed: true },
      }),
    }),
  );
  await page.getByRole("link", { name: "Ver prescrição" }).click();
  await expect(
    page.getByRole("heading", { name: "Prescrição não disponível" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Prescrição registrada", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Imprimir prescrição" }),
  ).toHaveCount(0);
  expect(unexpectedRequests).toEqual([]);
});

test("falhas de leitura do documento não expõem dados nem habilitam impressão", async ({
  page,
}) => {
  await login(page);
  const statuses = [403, 404, 409, 429, 500, 503];
  let index = 0;
  const seenStatuses: number[] = [];
  await page.route(`**/api/v1/entries/${entryId}`, async (route) => {
    const status = statuses[Math.min(index++, statuses.length - 1)];
    seenStatuses.push(status);
    await route.fulfill({
      status,
      json: { error: { code: `SYNTHETIC_${status}` } },
    });
  });
  await openHistoryDocumentLink(page);

  for (let attempt = 0; attempt < statuses.length; attempt += 1) {
    await expect(
      page.getByRole("heading", { name: "Documento não disponível" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Imprimir prescrição" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Paciente Sintético", { exact: true }),
    ).toHaveCount(0);
    if (attempt < statuses.length - 1)
      await page
        .getByRole("button", { name: "Tentar carregar novamente" })
        .click();
  }
  expect(index).toBeGreaterThanOrEqual(statuses.length);
  expect(new Set(seenStatuses)).toEqual(new Set(statuses));
  expect(unexpectedRequests).toEqual([]);
});

test("401 no documento encerra a sessão e não mantém a prévia na tela", async ({
  page,
}) => {
  await login(page);
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "UNAUTHENTICATED" } },
    }),
  );
  await openHistoryDocumentLink(page);
  await expect(page).toHaveURL("/login");
  await expect(
    page.getByRole("button", { name: "Imprimir prescrição" }),
  ).toHaveCount(0);
  expect(unexpectedRequests).toEqual([]);
});

for (const status of [500, 503]) {
  test(`falha HTTP ${status} ao finalizar concilia o estado e preserva o rascunho`, async ({
    page,
  }) => {
    await openCurrentAppointment(page);
    const description = `Conduta sintética preservada após HTTP ${status}.`;
    await page.getByLabel(/Descrição \/ conduta clínica/).fill(description);
    await page
      .getByRole("button", { name: "Revisar antes de finalizar" })
      .click();
    let completionCount = 0;
    let detailReads = 0;
    await page.route(`**/api/v1/entries/${entryId}/complete`, async (route) => {
      completionCount += 1;
      await route.fulfill({
        status,
        json: { error: { code: `SYNTHETIC_${status}` } },
      });
    });
    await page.route(`**/api/v1/entries/${entryId}`, async (route) => {
      detailReads += 1;
      await route.fulfill({ json: entry("in_progress") });
    });
    await page.getByRole("button", { name: "Confirmar finalização" }).click();
    await expect(
      page.getByRole("textbox", { name: /Descrição \/ conduta clínica/ }),
    ).toHaveValue(description);
    await expect(
      page.getByText(/finalização não foi confirmada/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirmar finalização" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Revisar antes de finalizar" }),
    ).toBeEnabled();
    expect([completionCount, detailReads]).toEqual([1, 1]);
    expect(unexpectedRequests).toEqual([]);
  });
}

test("falha de rede ao finalizar consulta estado do servidor e preserva o rascunho", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  const description = "Conduta sintética preservada após falha de rede.";
  await page.getByLabel(/Descrição \/ conduta clínica/).fill(description);
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  let completionCount = 0;
  let detailReads = 0;
  await page.route(`**/api/v1/entries/${entryId}/complete`, async (route) => {
    completionCount += 1;
    await route.abort("failed");
  });
  await page.route(`**/api/v1/entries/${entryId}`, async (route) => {
    detailReads += 1;
    await route.fulfill({ json: entry("in_progress") });
  });
  await page.getByRole("button", { name: "Confirmar finalização" }).click();
  await expect(
    page.getByRole("textbox", { name: /Descrição \/ conduta clínica/ }),
  ).toHaveValue(description);
  await expect(page.getByText(/finalização não foi confirmada/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar finalização" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Revisar antes de finalizar" }),
  ).toBeEnabled();
  expect([completionCount, detailReads]).toEqual([1, 1]);
  expect(unexpectedRequests).toEqual([]);
});

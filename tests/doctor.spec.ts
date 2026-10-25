import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function useAnonymousSession(page: Page) {
  await page.route("**/auth/me", async (route) => {
    await route.fulfill({ status: 401, json: {} });
  });
}

async function completeCurrentAppointment(page: Page) {
  await page.getByRole("button", { name: "Finalizar Atendimento" }).click();
  const dialog = page.getByRole("dialog", { name: "Finalização do atendimento" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Resumo clínico/).fill("Paciente reavaliado e em condições de alta nesta simulação.");
  await dialog.getByLabel(/Prescrição ou conduta adotada/).fill("Orientações clínicas registradas em atendimento demonstrativo.");
  await dialog.getByRole("button", { name: "Confirmar finalização" }).click();
  await expect(dialog).toHaveCount(0);
}

test("exibe o consultório médico e permite navegar de ida e volta", async ({
  page,
}) => {
  await useAnonymousSession(page);
  await page.goto("/medico?dev=medico");

  await expect(
    page.getByRole("heading", { name: "Dr. Marcelo Arantes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Consultório Médico" }),
  ).toHaveClass(/is-active/);
  await expect(page.locator(".doctor-queue-table tbody tr")).toHaveCount(5);
  await expect(page.getByText("Total na fila: 5 pacientes")).toBeVisible();

  await page.getByRole("link", { name: "Triagem & Fila" }).click();
  await expect(page).toHaveURL("/recepcao?dev=recepcionista");
  await expect(
    page.getByRole("heading", {
      name: "Fila de Espera e Gestão de Prioridades",
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Consultório Médico" }).click();
  await expect(page).toHaveURL("/medico?dev=medico");
  await expect(
    page.getByRole("link", { name: "Consultório Médico" }),
  ).toHaveClass(/is-active/);
});

test("finaliza a consulta e transfere o próximo paciente quando liberado", async ({
  page,
}) => {
  await useAnonymousSession(page);
  await page.goto("/medico?dev=medico");

  const callButton = page.getByRole("button", {
    name: "Chamar Próximo Paciente (U-038)",
  });
  await expect(callButton).toBeDisabled();

  await completeCurrentAppointment(page);
  await expect(page.getByText("Nenhum paciente em consulta.")).toBeVisible();
  await page
    .getByRole("button", { name: "Chamar Próximo Paciente (U-038)" })
    .click();

  await expect(page.locator(".doctor-consult-card.is-current")).toContainText(
    "Maria Clara Santos",
  );
  await expect(
    page.getByRole("button", { name: "Chamar Próximo Paciente (A-052)" }),
  ).toBeVisible();
  await expect(page.getByText("Total na fila: 4 pacientes")).toBeVisible();
});

test("compartilha a chamada do médico com a TV e mantém a última chamada ao finalizar", async ({
  page,
  context,
}) => {
  await useAnonymousSession(page);
  const tv = await context.newPage();
  await page.goto("/medico?dev=medico");
  await tv.goto("/transmissao/tv");

  await completeCurrentAppointment(page);
  await page
    .getByRole("button", { name: "Chamar Próximo Paciente (U-038)" })
    .click();

  await expect(
    tv.getByRole("heading", { name: "CHAMANDO AGORA" }),
  ).toBeVisible();
  await expect(tv.locator(".chamada-ticket")).toHaveText("U-038");
  await expect(tv.locator(".chamada-patient-name")).toHaveText(
    "MARIA CLARA SANTOS",
  );
  await expect(tv.locator(".chamada-hero")).toHaveClass(/prioridade-urgente/);
  await expect(tv.locator(".chamada-hero")).toHaveClass(/is-new-call/);
  await expect(tv.locator(".chamada-destination")).toContainText(
    "Consultório 04",
  );
  await expect(tv.locator(".chamada-doctor")).toContainText(
    "Dr. Marcelo Arantes",
  );

  await completeCurrentAppointment(page);
  await expect(tv.locator(".chamada-ticket")).toHaveText("U-038");
});

test("desabilita a chamada quando todos os pacientes aguardando são atendidos", async ({
  page,
}) => {
  await useAnonymousSession(page);
  await page.goto("/medico?dev=medico");
  await completeCurrentAppointment(page);

  while ((await page.locator(".doctor-queue-table tbody tr").count()) > 0) {
    const nextCall = page.getByRole("button", {
      name: /Chamar Próximo Paciente/,
    });
    await expect(nextCall).toBeEnabled();
    await nextCall.click();
    await completeCurrentAppointment(page);
  }

  await expect(page.getByRole("button", { name: "Fila vazia" })).toBeDisabled();
  await expect(page.getByText("Total na fila: 0 pacientes")).toBeVisible();
});

test("mostra o horário de Brasília sincronizado e atualiza os segundos", async ({
  page,
}) => {
  await useAnonymousSession(page);
  await page.goto("/medico?dev=medico");

  const headerClock = page.locator(".doctor-header-clock strong");
  const officeClock = page.locator(".doctor-current-time strong");
  const initialTime = await officeClock.innerText();

  await expect(headerClock).toHaveText(initialTime);
  expect(initialTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  await expect
    .poll(async () => officeClock.innerText(), { timeout: 2500 })
    .not.toBe(initialTime);
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector(".doctor-header-clock strong")?.textContent;
    const office = document.querySelector(".doctor-current-time strong")?.textContent;
    return Boolean(header && header === office);
  })).toBe(true);
});

test("finalização clínica exige informações e permite cancelar sem liberar paciente", async ({ page }) => {
  await useAnonymousSession(page);
  await page.goto("/medico?dev=medico");
  await page.getByRole("button", { name: "Finalizar Atendimento" }).click();
  const dialog = page.getByRole("dialog", { name: "Finalização do atendimento" });
  await expect(dialog).toContainText("Roberto Souza Lima");
  await expect(dialog.getByRole("button", { name: "Confirmar finalização" })).toBeDisabled();
  await dialog.getByLabel(/Resumo clínico/).fill("Avaliação inicial do paciente.");
  await expect(dialog.getByRole("button", { name: "Confirmar finalização" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Voltar ao atendimento" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".doctor-consult-card.is-current")).toContainText("Roberto Souza Lima");

  await completeCurrentAppointment(page);
  await expect(page.locator(".doctor-discharge-receipt")).toContainText("Atendimento finalizado nesta sessão");
  await expect(page.locator(".doctor-discharge-receipt")).toContainText("Prescrição / conduta");
});

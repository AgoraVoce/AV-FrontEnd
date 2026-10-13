import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function useAnonymousSession(page: Page) {
  await page.route("**/auth/me", async (route) => {
    await route.fulfill({ status: 401, json: {} });
  });
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
  await expect(page.locator(".doctor-queue-table tbody tr")).toHaveCount(4);
  await expect(page.getByText("Total na fila: 4 pacientes")).toBeVisible();

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

  await page
    .getByRole("button", { name: "Chamar Próximo Paciente (A-051)" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Finalize o atendimento atual antes de chamar o próximo.",
  );

  await page.getByRole("button", { name: "Finalizar Atendimento" }).click();
  await expect(page.getByText("Nenhum paciente em consulta.")).toBeVisible();
  await page
    .getByRole("button", { name: "Chamar Próximo Paciente (A-051)" })
    .click();

  await expect(page.locator(".doctor-consult-card.is-current")).toContainText(
    "Ana Beatriz Rocha",
  );
  await expect(
    page.getByText("Não há próximo paciente para chamar."),
  ).toBeVisible();
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
  await expect(headerClock).toHaveText(await officeClock.innerText());
});

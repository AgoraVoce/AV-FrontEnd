import { expect, test } from "@playwright/test";
import { QUEUE_MOCK } from "../src/reception/queue-data";

test("painel administrativo oferece a entrada para a transmissão e mostra o atendimento atual", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/transmissao");

  await expect(
    page.getByRole("heading", { name: "CHAMANDO AGORA" }),
  ).toBeVisible();
  await expect(page.locator(".chamada-ticket")).toHaveText("U-039");
  await expect(page.locator(".chamada-patient-name")).toHaveText(
    "ROBERTO SOUZA LIMA",
  );
  await expect(page.locator(".chamada-destination")).toContainText(
    "Consultório 04",
  );
  await expect(page.locator(".chamada-doctor")).toContainText(
    "Dr. Marcelo Arantes",
  );

  await page.evaluate((initialPatients) => {
    const channel = new BroadcastChannel("agora-voce.queue-updates");
    channel.postMessage({
      patients: initialPatients,
      auditEntries: [],
      revision: 1,
      patientVersions: Object.fromEntries(
        initialPatients.map((patient) => [patient.ticket, 0]),
      ),
      activeConsultationTicket: "U-039",
      currentCall: null,
    });
    channel.close();
  }, QUEUE_MOCK);
  await expect(page.locator(".chamada-ticket")).toHaveText("U-039");
  await expect(page.locator(".chamada-patient-name")).toHaveText(
    "ROBERTO SOUZA LIMA",
  );

  await expect(
    page.getByRole("link", { name: "Iniciar transmissão" }),
  ).toHaveAttribute("href", "/transmissao/tv");
  await expect(
    page.getByText("PRONTO-SOCORRO CENTRAL", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Painel em Tempo Real", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Previsão:/)).toHaveCount(0);
  await expect(page.getByRole("time")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);

  const layout = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    footerBottom: document
      .querySelector(".painel-footer-banner")!
      .getBoundingClientRect().bottom,
    viewportHeight: innerHeight,
  }));
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport);
  expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportHeight);
});

test("transmissão TV é uma superfície sem shell e mostra o atendimento atual", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/transmissao/tv");

  await expect(page.locator("aside.sidebar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tela cheia" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sair da transmissão" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "CHAMANDO AGORA" }),
  ).toBeVisible();
  await expect(page.locator(".chamada-ticket")).toHaveText("U-039");
  await expect(page.locator(".chamada-destination")).toContainText(
    "Consultório 04",
  );

  await page.evaluate((initialPatients) => {
    const calledPatient = initialPatients[2];
    const updatedPatients = initialPatients.map((patient) =>
      patient.ticket === calledPatient.ticket
        ? { ...patient, status: "called" as const }
        : patient,
    );
    const channel = new BroadcastChannel("agora-voce.queue-updates");
    channel.postMessage({
      patients: updatedPatients,
      auditEntries: [],
      revision: 1,
      patientVersions: Object.fromEntries(
        updatedPatients.map((patient) => [patient.ticket, 0]),
      ),
    });
    channel.close();
  }, QUEUE_MOCK);

  await expect(
    page.getByRole("heading", { name: "CHAMANDO AGORA" }),
  ).toBeVisible();
  await expect(page.locator(".chamada-ticket")).toHaveText("A-051");
  await expect(page.locator(".chamada-patient-name")).toHaveText(
    "ANA BEATRIZ ROCHA",
  );
  await expect(page.locator(".chamada-destination")).toHaveCount(0);
  await expect(page.locator(".chamada-doctor")).toHaveCount(0);
});

test("relógio avança e a prioridade da chamada acompanha o estado recebido", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-06T14:30:33.000Z") });
  await page.goto("/transmissao/tv");
  const clock = page.getByRole("time");
  const initialTime = await clock.textContent();
  await page.clock.fastForward(1100);
  await expect(clock).not.toHaveText(initialTime ?? "");

  await page.evaluate((initialPatients) => {
    const updatedPatients = initialPatients.map((patient) =>
      patient.ticket === "U-038"
        ? { ...patient, status: "called" as const, priority: "alert" as const }
        : patient,
    );
    const channel = new BroadcastChannel("agora-voce.queue-updates");
    channel.postMessage({
      patients: updatedPatients,
      auditEntries: [],
      revision: 1,
      patientVersions: Object.fromEntries(
        updatedPatients.map((patient) => [patient.ticket, 0]),
      ),
    });
    channel.close();
  }, QUEUE_MOCK);

  await expect(page.locator(".chamada-priority-pill")).toContainText("ALERTA");
  await expect(page.locator(".chamada-hero")).toHaveClass(/prioridade-alerta/);
});

test("transmissão TV navega de volta sem criar overflow horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/transmissao/tv");
  await page.getByRole("button", { name: "Sair da transmissão" }).click();
  await expect(page).toHaveURL("/transmissao");
  await expect(
    page.getByRole("link", { name: "Iniciar transmissão" }),
  ).toBeVisible();

  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
});

test("sair da transmissão também navega quando o painel está em tela cheia", async ({
  page,
}) => {
  await page.goto("/transmissao/tv");
  await page.getByRole("button", { name: "Tela cheia" }).click();
  await expect(
    page.getByRole("button", { name: "Sair da tela cheia" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Sair da transmissão" }).click();
  await expect(page).toHaveURL("/transmissao");
  await expect(
    page.getByRole("link", { name: "Iniciar transmissão" }),
  ).toBeVisible();
});

test("entrada administrativa abre a rota TV standalone", async ({ page }) => {
  await page.goto("/transmissao");
  await page.getByRole("link", { name: "Iniciar transmissão" }).click();
  await expect(page).toHaveURL("/transmissao/tv");
  await expect(page.locator("aside.sidebar")).toHaveCount(0);
});

test("botão Sair do painel público retorna ao login sem sessão autenticada", async ({
  page,
}) => {
  let logoutRequested = false;
  await page.route("**/auth/logout", async (route) => {
    logoutRequested = true;
    await route.fulfill({ status: 503 });
  });
  await page.goto("/transmissao");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(logoutRequested).toBe(false);
});

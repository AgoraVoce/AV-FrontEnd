import { expect, test } from "@playwright/test";
import { QUEUE_MOCK } from "../src/reception/queue-data";

test("painel público compõe chamada atual, próximos pacientes e protocolo", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/transmissao");

  await expect(page.getByLabel("Marca do sistema").getByText("Agora Você", { exact: true })).toBeVisible();
  await expect(page.getByText("PRONTO-SOCORRO CENTRAL", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Módulos de atendimento" }).getByRole("link", { name: "Painel TV Pública" })).toHaveClass(/is-active/);
  await expect(page.getByText("Painel em Tempo Real")).toBeVisible();
  await expect(page.getByRole("time")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);

  await expect(page.getByRole("heading", { name: "CHAMANDO AGORA" })).toBeVisible();
  await expect(page.locator(".chamada-ticket")).toHaveText("U-038");
  await expect(page.locator(".chamada-hero")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".chamada-patient-name")).toHaveText("MARIA CLARA SANTOS");
  await expect(page.locator(".chamada-destination")).toContainText("CONSULTÓRIO 03");
  await expect(page.locator(".chamada-doctor")).toContainText("Dra. Helena Martins");

  await expect(page.locator(".proximo-card")).toHaveCount(5);
  await expect(page.locator(".proximo-ticket")).toHaveText(["U-039", "A-052", "A-051", "T-090", "T-089"]);
  await expect(page.locator(".proximo-name").first()).toHaveText("ROBERTO S.");
  await expect(page.locator(".proximo-name").nth(2)).toHaveText("ANA BEATRIZ R.");
  await expect(page.getByText(/PROTOCOLO DE MANCHESTER ATIVO/)).toBeVisible();
  await expect(page.getByText(/Tenha em mãos seu documento com foto/)).toBeVisible();

  const layout = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    footerBottom: document.querySelector(".painel-footer-banner")!.getBoundingClientRect().bottom,
    viewportHeight: innerHeight,
  }));
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport);
  expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportHeight);
});

test("relógio avança a cada segundo e prioridade da chamada sincroniza", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-06T14:30:33.000Z") });
  await page.goto("/transmissao");
  const clock = page.getByRole("time");
  const initialTime = await clock.textContent();
  await page.clock.fastForward(1100);
  await expect(clock).not.toHaveText(initialTime ?? "");
  await expect(clock).toHaveText(/^\d{2}:\d{2}:\d{2}$/);

  await page.evaluate((initialPatients) => {
    const updatedPatients = initialPatients.map((patient) =>
      patient.ticket === "U-038" ? { ...patient, priority: "alert" as const } : patient,
    );
    const channel = new BroadcastChannel("agora-voce.queue-updates");
    channel.postMessage({
      patients: updatedPatients,
      auditEntries: [],
      revision: 1,
      patientVersions: Object.fromEntries(updatedPatients.map((patient) => [patient.ticket, 1])),
    });
    channel.close();
  }, QUEUE_MOCK);

  await expect(page.locator(".chamada-priority-pill")).toContainText("ALERTA");
  await expect(page.locator(".chamada-hero")).toHaveClass(/prioridade-alerta/);
});

test("menu lateral abre no mobile sem causar overflow horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/transmissao");

  const menuButton = page.getByRole("button", { name: "Abrir menu" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(page.getByRole("button", { name: "Fechar menu" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Módulos de atendimento" }).getByRole("link", { name: "Painel TV Pública" })).toHaveClass(/is-active/);

  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
});

test("Painel TV Pública navega para Triagem & Fila no ambiente de desenvolvimento", async ({ page }) => {
  await page.goto("/transmissao");

  await page.getByRole("link", { name: "Triagem & Fila" }).click();
  await expect(page).toHaveURL(/\/recepcao\?dev=recepcionista$/);
  await expect(page.getByRole("heading", { name: "Fila de Espera e Gestão de Prioridades" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Triagem & Fila" })).toHaveClass(/is-active/);

  await page.getByRole("link", { name: "Painel TV Pública" }).click();
  await expect(page).toHaveURL("/transmissao");
  await expect(page.getByRole("heading", { name: "CHAMANDO AGORA" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Painel TV Pública" })).toHaveClass(/is-active/);
});

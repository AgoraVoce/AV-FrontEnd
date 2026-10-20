import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { QUEUE_MOCK } from "../src/reception/queue-data";

const receptionUrl = "/recepcao?dev=RECEPCIONISTA";

async function openPatient(
  page: import("@playwright/test").Page,
  name = "Ana Beatriz Rocha",
) {
  const row = page.locator("tr").filter({ hasText: name });
  await row.getByRole("button", { name: "Alterar prioridade" }).click();
  return page.getByRole("dialog", { name: "Alterar Prioridade do Paciente" });
}

async function changeAnaToUrgent(page: import("@playwright/test").Page) {
  const modal = await openPatient(page);
  await modal.getByRole("button", { name: "Urgente" }).click();
  await modal
    .getByLabel(/Motivo da alteração de prioridade/)
    .fill("Piora clínica observada durante a espera.");
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  return modal;
}

test("modal mostra requisitos e confirma descarte ao fechar", async ({
  page,
}) => {
  await page.goto(receptionUrl);
  const modal = await openPatient(page);
  await expect(modal.getByRole("button", { name: "Alerta" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    modal.getByText("Escolha um nível diferente do atual"),
  ).toBeVisible();
  await expect(
    modal.getByText("Descreva o motivo (mín. 10 caracteres)"),
  ).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Salvar Alteração" }),
  ).toBeDisabled();
  const accessibility = await new AxeBuilder({ page })
    .include(".reevaluation-modal")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await modal.getByLabel(/Motivo da alteração de prioridade/).fill("rascunho");

  await page.keyboard.press("Escape");
  const discard = page.getByRole("alertdialog", {
    name: "Descartar alterações?",
  });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Manter edição" }).click();
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: "Cancelar" }).click();
  await page
    .getByRole("alertdialog", { name: "Descartar alterações?" })
    .getByRole("button", { name: "Descartar alterações" })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator("tr.is-reassessing")).toHaveCount(0);

  const reopened = await openPatient(page);
  await reopened.getByRole("button", { name: "Fechar modal" }).click();
  await expect(reopened).toHaveCount(0);
  const overlayModal = await openPatient(page);
  await page
    .locator(".reevaluation-overlay")
    .click({ position: { x: 8, y: 8 } });
  await expect(overlayModal).toHaveCount(0);
});

test("salva auditoria e desfaz por botão e Ctrl+Z sem capturar campos de texto", async ({
  page,
}) => {
  await page.goto(receptionUrl);
  await changeAnaToUrgent(page);
  const toast = page.locator(".reevaluation-notifications");
  await expect(toast).toContainText(
    "Prioridade de Ana Beatriz Rocha alterada para Urgente",
  );
  await expect(toast.getByRole("button", { name: "Desfazer" })).toBeEnabled();
  await expect(page.locator(".mini-stat.urgent")).toContainText("4 Urgentes");
  await expect(page.locator(".mini-stat.alert")).toContainText("4 Alertas");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const toast = document
          .querySelector(".reevaluation-notifications")!
          .getBoundingClientRect();
        const table = document
          .querySelector(".table-wrapper")!
          .getBoundingClientRect();
        const register = document
          .querySelector(".toolbar-primary-button")!
          .getBoundingClientRect();
        const intersects = (a: DOMRect, b: DOMRect) =>
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;
        return !intersects(toast, table) && !intersects(toast, register);
      }),
    )
    .toBe(true);

  await toast.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.locator(".mini-stat.urgent")).toContainText("3 Urgentes");
  await expect(page.locator(".mini-stat.alert")).toContainText("5 Alertas");
  await expect(page.locator(".queue-led-overlay.led-alert")).toHaveAttribute(
    "data-led-phase",
    "snake",
  );
  await expect(page.locator(".reception-page")).toHaveAttribute(
    "data-audit-count",
    "2",
  );
  await expect(page.locator(".reevaluation-notifications")).toContainText(
    "Alteração desfeita. Ana Beatriz Rocha voltou para Alerta",
  );

  await changeAnaToUrgent(page);
  const searchInput = page.getByRole("searchbox", {
    name: "Filtrar por nome, senha ou queixa",
  });
  await searchInput.fill("Ana");
  await expect(searchInput).toBeFocused();
  await page.keyboard.press("Control+z");
  // Ctrl+Z inside a text field belongs to the browser's native edit history,
  // not to the page-level clinical priority undo shortcut.
  await expect(page.locator(".mini-stat.urgent")).toContainText("4 Urgentes");
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.press("Control+z");
  await expect(page.locator(".mini-stat.urgent")).toContainText("3 Urgentes");

  await changeAnaToUrgent(page);
  const modal = await openPatient(page);
  const modalUndo = modal.getByRole("button", {
    name: /Desfazer última alteração/,
  });
  await expect(modalUndo).toBeEnabled();
  await modalUndo.click();
  await expect(page.locator(".mini-stat.urgent")).toContainText("3 Urgentes");
  await expect(page.locator(".reception-page")).toHaveAttribute(
    "data-audit-count",
    "6",
  );
});

test("mudança concorrente do mesmo paciente atualiza o modal sem sobrescrever", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto(receptionUrl), second.goto(receptionUrl)]);
  const firstModal = await openPatient(first);
  await firstModal
    .getByLabel(/Motivo da alteração de prioridade/)
    .fill("Paciente relata piora importante.");

  await changeAnaToUrgent(second);
  await expect(firstModal.getByRole("alert")).toContainText(
    "Este paciente foi atualizado por outra pessoa",
  );
  await expect(
    firstModal.getByRole("button", { name: "Urgente" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    firstModal.getByRole("button", { name: "Salvar Alteração" }),
  ).toBeDisabled();
  await expect(first.locator(".mini-stat.urgent")).toContainText("4 Urgentes");
  await context.close();
});

test("undo da última alteração expira após dez minutos", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-06T12:00:00.000Z") });
  await page.goto(receptionUrl);
  await changeAnaToUrgent(page);
  await expect(page.locator(".reevaluation-notifications")).toContainText(
    "Prioridade de Ana Beatriz Rocha alterada para Urgente",
  );
  await page.clock.fastForward(11 * 60 * 1000);

  const modal = await openPatient(page);
  const undo = modal.getByRole("button", { name: /Desfazer última alteração/ });
  await expect(undo).toBeDisabled();
  await expect(undo).toHaveAttribute(
    "title",
    "O prazo de 10 minutos para desfazer expirou.",
  );
  await expect(page.locator(".mini-stat.urgent")).toContainText("4 Urgentes");
});

test("LED serpente usa a nova gravidade, pisca na quantidade certa e remove o overlay", async ({
  browser,
}) => {
  for (const [
    patientName,
    newLevel,
    expectedClass,
    expectedColor,
    blinkCount,
  ] of [
    ["Ana Beatriz Rocha", "Urgente", "led-urgent", "#c73c3d", "2"],
    ["Maria Clara Santos", "Alerta", "led-alert", "#d59a17", "2"],
    ["Ana Beatriz Rocha", "Tranquilo", "led-calm", "#1f8d5a", "1"],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    const page = await context.newPage();
    await page.goto(receptionUrl);
    const row = page.locator("tr").filter({ hasText: patientName });
    await row.getByRole("button", { name: "Alterar prioridade" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByRole("button", { name: newLevel, exact: true }).click();
    await modal
      .getByLabel(/Motivo da alteração de prioridade/)
      .fill("Reavaliação clínica após nova observação.");
    await modal.getByRole("button", { name: "Salvar Alteração" }).click();

    const overlay = page.locator(`.queue-led-overlay.${expectedClass}`);
    await expect(overlay).toHaveAttribute("data-led-phase", "snake");
    await expect(overlay.locator(".queue-led-snake")).toHaveCount(4);
    const snakeStyle = await overlay
      .locator(".queue-led-snake-0")
      .evaluate((element) => ({
        duration: getComputedStyle(element).animationDuration,
        name: getComputedStyle(element).animationName,
        color: getComputedStyle(element.closest(".queue-led-overlay")!)
          .getPropertyValue("--queue-led-color")
          .trim(),
        dash: getComputedStyle(element).strokeDasharray,
      }));
    expect(snakeStyle).toEqual({
      duration: "1.2s",
      name: "led-snake-0",
      color: expectedColor,
      dash: "6px, 94px",
    });
    // The calm blink can last only 300 ms. Observe DOM mutations before it
    // starts; polling after a fixed wait can skip that transient state in CI.
    const blinkObserved = page.evaluate((selector) =>
      new Promise<{ duration: string; count: string }>((resolve, reject) => {
        const node = document.querySelector(selector);
        if (!node) { reject(new Error("LED overlay not found")); return; }
        const observer = new MutationObserver(check);
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error("LED never reached the blink phase"));
        }, 5000);
        function check() {
          const blink = node?.querySelector(".queue-led-blink");
          if (!blink) return;
          const style = getComputedStyle(blink);
          window.clearTimeout(timeout);
          observer.disconnect();
          resolve({
            duration: style.animationDuration,
            count: style.animationIterationCount,
          });
        }
        observer.observe(node, { childList: true, subtree: true });
        check();
      }), `.queue-led-overlay.${expectedClass}`);
    await page.waitForTimeout(400);
    const midTravelOffset = Number.parseFloat(
      await overlay
        .locator(".queue-led-snake-0")
        .evaluate((element) => getComputedStyle(element).strokeDashoffset),
    );
    expect(midTravelOffset).toBeLessThan(-10);
    expect(midTravelOffset).toBeGreaterThan(-90);

    const blinkStyle = await blinkObserved;
    expect(blinkStyle).toEqual({ duration: "0.3s", count: blinkCount });
    await expect(overlay).toHaveCount(0, { timeout: 2500 });
    await context.close();
  }
});

test("LED avança mesmo se o navegador não emitir animationend", async ({ page }) => {
  await page.goto(receptionUrl);
  await page.addStyleTag({
    content: ".queue-led-snake { animation-play-state: paused !important; }",
  });
  await changeAnaToUrgent(page);
  const overlay = page.locator(".queue-led-overlay.led-urgent");
  await expect(overlay).toHaveAttribute("data-led-phase", "snake");
  await expect(overlay).toHaveAttribute("data-led-phase", "blink", {
    timeout: 4000,
  });
  await expect(overlay).toHaveCount(0, { timeout: 2500 });
});

test("prefers-reduced-motion usa destaque estático e limpa após 1,5s", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(receptionUrl);
  const modal = await openPatient(page);
  await modal.getByRole("button", { name: "Urgente" }).click();
  await modal
    .getByLabel(/Motivo da alteração de prioridade/)
    .fill("Reavaliação clínica com movimento reduzido.");
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  const overlay = page.locator(".queue-led-overlay");
  await expect(overlay).toHaveAttribute("data-led-phase", "static");
  await expect(overlay.locator(".queue-led-static")).toHaveCount(1);
  await expect(overlay).toHaveCount(0, { timeout: 2000 });
  await context.close();
});

test("LED encontra o paciente na página nova após a reordenação", async ({
  page,
}) => {
  await page.goto(receptionUrl);
  await page.evaluate((initialPatients) => {
    const additionalPatients = Array.from({ length: 10 }, (_, index) => {
      const waitMinutes = index + 1;
      return {
        ticket: `D-${String(index + 1).padStart(3, "0")}`,
        name:
          index === 0
            ? "Paciente Página Destino"
            : `Paciente Demonstração ${index + 1}`,
        age: 30,
        complaint: "Acompanhamento clínico",
        priority: "calm" as const,
        waitMinutes,
        arrivedAt: new Date(Date.now() - waitMinutes * 60_000).toISOString(),
        status: "waiting" as const,
        vitals: {
          bloodPressure: "120/80",
          heartRate: 78,
          oxygenSaturation: 98,
          temperature: 36.8,
        },
      };
    });
    const channel = new BroadcastChannel("agora-voce.queue-updates");
    channel.postMessage({
      patients: [...initialPatients, ...additionalPatients],
      auditEntries: [],
      revision: 0,
      patientVersions: Object.fromEntries(
        [...initialPatients, ...additionalPatients].map((patient) => [
          patient.ticket,
          0,
        ]),
      ),
    });
    channel.close();
  }, QUEUE_MOCK);
  await expect(page.locator(".pagination-copy")).toHaveText("Página 1 de 3");
  await page.getByRole("button", { name: "Próxima ›" }).click();
  await page.getByRole("button", { name: "Próxima ›" }).click();
  await expect(page.getByText("Página 3 de 3")).toBeVisible();
  const destination = page
    .locator("tr")
    .filter({ hasText: "Paciente Página Destino" });
  await destination.getByRole("button", { name: "Alterar prioridade" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "Urgente" }).click();
  await modal
    .getByLabel(/Motivo da alteração de prioridade/)
    .fill("Nova informação clínica requer prioridade imediata.");
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();

  await expect(page.getByText("Página 1 de 3")).toBeVisible();
  await expect(page.locator('tr[data-patient-ticket="D-001"]')).toContainText(
    "Paciente Página Destino",
  );
  const led = page.locator('.queue-led-overlay[data-patient-ticket="D-001"]');
  await expect(led).toHaveAttribute("data-priority", "urgent");
  await expect(led).toHaveAttribute("data-led-phase", "snake");
  const rowBox = await page
    .locator('tr[data-patient-ticket="D-001"]')
    .boundingBox();
  const ledBox = await led.boundingBox();
  expect(rowBox && ledBox && Math.abs(rowBox.y - ledBox.y) < 1).toBe(true);
});

test("novo salvamento cancela o LED anterior e substitui o overlay", async ({
  page,
}) => {
  await page.goto(receptionUrl);
  const firstModal = await openPatient(page, "Ana Beatriz Rocha");
  await firstModal.getByRole("button", { name: "Urgente" }).click();
  await firstModal
    .getByLabel(/Motivo da alteração de prioridade/)
    .fill("Piora clínica observada durante a espera.");
  await firstModal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(
    page.locator('.queue-led-overlay[data-patient-ticket="A-051"]'),
  ).toHaveAttribute("data-led-phase", "snake");

  const secondModal = await openPatient(page, "Maria Clara Santos");
  await secondModal.getByRole("button", { name: "Tranquilo" }).click();
  await secondModal
    .getByLabel(/Motivo da alteração de prioridade/)
    .fill("Novo exame indica condição estável.");
  await secondModal.getByRole("button", { name: "Salvar Alteração" }).click();

  await expect(page.locator(".queue-led-overlay")).toHaveCount(1);
  await expect(
    page.locator('.queue-led-overlay[data-patient-ticket="U-038"]'),
  ).toHaveAttribute("data-priority", "calm");
  await expect(
    page.locator('.queue-led-overlay[data-patient-ticket="U-038"]'),
  ).toHaveAttribute("data-led-phase", "snake");
});

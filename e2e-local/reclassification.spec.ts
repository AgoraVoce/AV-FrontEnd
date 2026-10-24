import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "review-user",
  name: "Joana da Sessão",
  email: "joana@clinica.test",
  role: "RECEPCIONISTA",
};
const entries = [
  { entryId: "entry-first", fullName: "Primeira Pessoa", queueCode: "F-001" },
  { entryId: "entry-second", fullName: "Segunda Pessoa", queueCode: "F-002" },
];
async function setup(page: Page, initialSeverity = "VERDE") {
  let items = [...entries];
  let failDetail = false;
  let detailCalls = 0;
  await page.clock.install();
  // All API calls are intercepted: no data is written to the real backend.
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/login"))
      return route.fulfill({
        json: {
          accessToken: "test-review",
          tokenType: "Bearer",
          expiresIn: 900,
          user,
        },
      });
    if (path.endsWith("/queues/waiting"))
      return route.fulfill({ json: { items } });
    if (path.includes("/entries/")) {
      detailCalls++;
      if (failDetail)
        return route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Indisponível" } },
        });
      const entry = entries.find((item) => path.endsWith(item.entryId))!;
      return route.fulfill({
        json: {
          id: entry.entryId,
          patientId: `patient-${entry.entryId}`,
          status: "waiting",
          severity: initialSeverity,
          enteredAt: "2026-10-24T10:00:00Z",
          queueCode: entry.queueCode,
          patient: {
            id: `patient-${entry.entryId}`,
            fullName: entry.fullName,
            birthDate: null,
          },
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(
    page.getByRole("cell", { name: "Segunda Pessoa", exact: true }),
  ).toBeVisible();
  const trigger = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "Segunda Pessoa", exact: true }),
    })
    .getByRole("button", { name: "Alterar prioridade" });
  async function open() {
    await trigger.click();
    await expect(
      page.getByRole("dialog").getByRole("radio", {
        name: initialSeverity === "VERDE" ? /Tranquilo/ : /Alerta/,
      }),
    ).toBeChecked();
  }
  return {
    trigger,
    open,
    leave: () => {
      items = [entries[0]];
    },
    fail: () => {
      failDetail = true;
    },
    recover: () => {
      failDetail = false;
    },
    detailCalls: () => detailCalls,
  };
}

test("barra preserva ordem e modal fecha por X, cancelar, ESC e overlay com foco restaurado", async ({
  page,
}) => {
  const { trigger, open } = await setup(page);
  await expect(
    page.locator(".reception-toolbar").locator("button,a"),
  ).toHaveText([
    "Atualizar fila",
    "Filtrar",
    "Buscar pacientes",
    "Cadastrar Paciente",
  ]);
  const styles = await page.locator(".reception-toolbar").evaluate((bar) => {
    const filter = Array.from(bar.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Filtrar",
    )!;
    const search = bar.querySelector('a[href="/pacientes"]')!;
    const properties = [
      "height",
      "border",
      "borderRadius",
      "backgroundColor",
      "fontFamily",
      "fontWeight",
      "fontSize",
      "padding",
      "textDecorationLine",
      "flexGrow",
      "whiteSpace",
    ] as const;
    return [filter, search].map((element) => {
      const style = getComputedStyle(element);
      return properties.map((property) => style[property]);
    });
  });
  expect(styles[0]).toEqual(styles[1]);
  for (const method of ["x", "cancel", "escape", "overlay"]) {
    await open();
    const modal = page.getByRole("dialog");
    await expect(
      modal.getByText("Segunda Pessoa", { exact: true }),
    ).toBeVisible();
    await expect(modal.getByText(/Joana da Sessão/)).toBeVisible();
    await expect(
      modal.getByRole("button", { name: "Salvar Alteração" }),
    ).toBeDisabled();
    if (method === "x")
      await modal.getByRole("button", { name: "Fechar reavaliação" }).click();
    if (method === "cancel")
      await modal
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
    if (method === "escape") await page.keyboard.press("Escape");
    if (method === "overlay")
      await page
        .locator(".reclassification-overlay")
        .click({ position: { x: 3, y: 3 } });
    await expect(modal).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      "hidden",
    );
  }
  expect(
    await page.evaluate(() =>
      localStorage.getItem("av:reception-reassessments:v1:review-user"),
    ),
  ).toBeNull();
});

test("valida justificativa, mantém rascunho no polling e salva auditoria, cores, ordem e contadores", async ({
  page,
}) => {
  const { open } = await setup(page);
  await open();
  const modal = page.getByRole("dialog");
  await modal.getByRole("radio", { name: /Urgente/ }).check();
  const reason = modal.getByRole("textbox");
  const saveBox = await modal
    .getByRole("button", { name: "Salvar Alteração" })
    .boundingBox();
  await page.mouse.click(
    saveBox!.x + saveBox!.width / 2,
    saveBox!.y + saveBox!.height / 2,
  );
  await expect(modal.getByText(/pelo menos 10 caracteres/)).toBeVisible();
  await reason.fill("curta");
  await reason.blur();
  await expect(modal.getByText(/pelo menos 10 caracteres/)).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Salvar Alteração" }),
  ).toBeDisabled();
  await reason.fill("Reavaliação clínica justificada pelo responsável.");
  await page.clock.fastForward(30_000);
  await expect(reason).toHaveValue(
    "Reavaliação clínica justificada pelo responsável.",
  );
  await expect(modal.getByRole("radio", { name: /Urgente/ })).toBeChecked();
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator("tbody tr").first()).toContainText(
    "Segunda Pessoa",
  );
  await expect(page.locator("tbody tr").first()).toHaveClass(/urgent/);
  await expect(
    page.locator("tbody tr").first().locator(".reception-priority-pill"),
  ).toHaveText("● Urgente");
  await expect(page.locator(".reception-risks .urgent strong")).toContainText(
    "1 Urgentes",
  );
  await expect(page.locator(".reception-proportion .urgent")).toHaveAttribute(
    "style",
    /100%/,
  );
  const stored = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("av:reception-reassessments:v1:review-user")!,
    ),
  );
  expect(stored.records).toHaveLength(1);
  expect(stored.records[0]).toMatchObject({
    entryId: "entry-second",
    patientId: "patient-entry-second",
    previousLevel: "VERDE",
    newLevel: "VERMELHO",
    responsible: { id: user.id, name: user.name },
  });
  expect(Number.isNaN(Date.parse(stored.records[0].occurredAt))).toBe(false);
  await page.getByRole("button", { name: "Atualizar fila" }).click();
  await expect(page.locator("tbody tr").first()).toHaveClass(/urgent/);
  await page.reload();
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page.locator("tbody tr").first()).toHaveClass(/urgent/);
});

test("erro de API preserva formulário e permite tentar novamente; paciente que sai bloqueia salvar", async ({
  page,
}) => {
  const controls = await setup(page);
  await controls.open();
  const modal = page.getByRole("dialog");
  await modal.getByRole("radio", { name: /Alerta/ }).check();
  await modal
    .getByRole("textbox")
    .fill("Motivo clínico informado para a reavaliação.");
  controls.fail();
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal.getByRole("alert")).toBeVisible();
  await expect(page.locator(".reception-priority-led")).toHaveCount(0);
  await expect(modal.getByRole("textbox")).toHaveValue(
    "Motivo clínico informado para a reavaliação.",
  );
  await expect(modal.getByRole("radio", { name: /Alerta/ })).toBeChecked();
  controls.recover();
  controls.leave();
  await page.clock.fastForward(30_000);
  await expect(modal.getByText(/saiu da fila/)).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Salvar Alteração" }),
  ).toBeDisabled();
});

test("modal responsivo e navegação por teclado com focus trap", async ({
  page,
}) => {
  const { open } = await setup(page);
  await open();
  const modal = page.getByRole("dialog");
  for (const width of [1920, 1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(modal).toBeVisible();
    const box = await modal.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(16);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width - 16);
    await page.screenshot({
      path: `/tmp/reclassification-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await modal.getByRole("radio", { name: /Tranquilo/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(modal.getByRole("radio", { name: /Alerta/ })).toBeChecked();
  await expect(modal.getByRole("radio", { name: /Alerta/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(modal.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    modal.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    modal.getByRole("button", { name: "Fechar reavaliação" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    modal.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeFocused();
});

test("falha ao persistir é visível sem perder justificativa", async ({
  page,
}) => {
  const { open } = await setup(page);
  await open();
  const modal = page.getByRole("dialog");
  await modal.getByRole("radio", { name: /Urgente/ }).check();
  await modal
    .getByRole("textbox")
    .fill("Justificativa clínica com tamanho suficiente.");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("storage unavailable");
    };
  });
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal.getByRole("alert")).toContainText("persistir");
  await expect(modal.getByRole("textbox")).toHaveValue(
    "Justificativa clínica com tamanho suficiente.",
  );
});

for (const choice of [
  { level: "VERMELHO", name: "Urgente" },
  { level: "AMARELO", name: "Alerta" },
  { level: "VERDE", name: "Tranquilo" },
]) {
  test(`LED ${choice.level} acompanha a linha, pulsa e termina sem repetir no polling`, async ({
    page,
  }) => {
    const { open } = await setup(
      page,
      choice.level === "VERDE" ? "AMARELO" : "VERDE",
    );
    await page.addStyleTag({
      content:
        ".reception-priority-led * {animation-play-state:paused!important}",
    });
    await expect(page.locator(".reception-priority-led")).toHaveCount(0);
    await open();
    const modal = page.getByRole("dialog");
    await modal.getByRole("radio", { name: new RegExp(choice.name) }).check();
    await modal
      .getByRole("textbox")
      .fill("Justificativa clínica para confirmar a alteração.");
    await modal.getByRole("button", { name: "Salvar Alteração" }).click();
    const led = page.locator(".reception-priority-led");
    await expect(led).toHaveAttribute("data-entry-id", "entry-second");
    await expect(led).toHaveAttribute("data-priority", choice.level);
    await expect(led).toHaveAttribute("data-led-phase", "snake");
    const row = page.locator('tr[data-priority-entry="entry-second"]');
    const rowBox = (await row.boundingBox())!;
    const ledBox = (await led.boundingBox())!;
    expect(Math.abs(rowBox.y - ledBox.y)).toBeLessThan(2);
    expect(Math.abs(rowBox.width - ledBox.width)).toBeLessThan(2);
    const stroke = await led
      .locator("rect")
      .first()
      .evaluate((element) => getComputedStyle(element).stroke);
    const token = await page.locator(".reception-live").evaluate(
      (element, level) =>
        getComputedStyle(element)
          .getPropertyValue(
            level === "VERMELHO"
              ? "--nivel-urgente-cor"
              : level === "AMARELO"
                ? "--nivel-alerta-cor"
                : "--nivel-tranquilo-cor",
          )
          .trim(),
      choice.level,
    );
    expect(token).not.toBe("");
    const expectedColor = await page.evaluate((color) => {
      const marker = document.createElement("span");
      marker.style.color = color;
      document.body.append(marker);
      const computed = getComputedStyle(marker).color;
      marker.remove();
      return computed;
    }, token);
    expect(stroke).toBe(expectedColor);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.clock.runFor(50);
    await page.locator(".reception-table-scroll").evaluate((element) => {
      element.scrollLeft = 200;
    });
    const mobileRow = (await row.boundingBox())!;
    const mobileLed = (await led.boundingBox())!;
    expect(Math.abs(mobileRow.x - mobileLed.x)).toBeLessThan(2);
    expect(Math.abs(mobileRow.width - mobileLed.width)).toBeLessThan(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.clock.runFor(1500);
    await expect(led).toHaveAttribute("data-led-phase", "blink");
    await expect(led.locator(".queue-led-blink")).toHaveCSS(
      "animation-iteration-count",
      choice.level === "VERDE" ? "1" : "2",
    );
    await page.clock.runFor(850);
    await expect(led).toHaveCount(0);
    await page.clock.fastForward(30_000);
    await expect(led).toHaveCount(0);
  });
}

test("LED respeita movimento reduzido e reaparece só após um novo salvamento", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { open } = await setup(page);
  await open();
  let modal = page.getByRole("dialog");
  await modal.getByRole("radio", { name: /Urgente/ }).check();
  await modal
    .getByRole("textbox")
    .fill("Justificativa clínica para a nova prioridade.");
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  const led = page.locator(".reception-priority-led");
  await expect(led).toHaveAttribute("data-led-phase", "static");
  await expect(led.locator("rect")).toHaveCSS("animation-name", "none");
  await page.screenshot({
    path: "/tmp/reception-led-static.png",
    fullPage: true,
  });
  await page.clock.runFor(1600);
  await expect(led).toHaveCount(0);
  await page
    .locator('tr[data-priority-entry="entry-second"]')
    .getByRole("button", { name: "Alterar prioridade" })
    .click();
  modal = page.getByRole("dialog");
  await expect(modal.getByRole("radio", { name: /Urgente/ })).toBeChecked();
  await modal.getByRole("radio", { name: /Alerta/ }).check();
  await modal
    .getByRole("textbox")
    .fill("Segunda reavaliação clínica com nova justificativa.");
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(led).toHaveAttribute("data-priority", "AMARELO");
});

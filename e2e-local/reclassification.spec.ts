import type { Reassessment } from "../src/integrations/reception-reassessment";
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
async function setup(
  page: Page,
  initialSeverity = "VERDE",
  registeredSymptoms: string[] = [],
  expanded = false,
) {
  let items = [...entries];
  let failDetail = false;
  let postError = 0;
  let detailCalls = 0;
  const audits: Reassessment[] = [];
  const payloads: Record<string, unknown>[] = [];
  const states = new Map(
    entries.map((entry) => [
      entry.entryId,
      {
        severity: initialSeverity,
        symptomIds: [...registeredSymptoms],
        otherSymptoms: "Queixa inicial informada",
        shortNote: (expanded ? "Observação operacional original" : null) as
          string | null,
        updatedAt: "2026-10-24T10:00:00Z",
      },
    ]),
  );
  await page.clock.install();
  // All API calls are intercepted. Audits/clinical state live in the fake server, never localStorage.
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
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
      return route.fulfill({
        json: {
          items: expanded
            ? items.map((item) => {
                const state = states.get(item.entryId)!;
                return {
                  ...item,
                  id: item.entryId,
                  nome: item.fullName,
                  senha: item.queueCode,
                  gravidade: state.severity,
                  status: "aguardando",
                  horarioEntrada: "2026-10-24T10:00:00Z",
                  queixa: [
                    ...state.symptomIds.map(() => "Sintoma cadastrado"),
                    state.otherSymptoms,
                  ]
                    .filter(Boolean)
                    .join(", "),
                };
              })
            : items,
        },
      });
    if (path.endsWith("/doctors"))
      return route.fulfill({
        json: { items: [], page: 1, pageSize: 100, total: 0 },
      });
    if (path.endsWith("/reassessments")) {
      const entryId = path.split("/").at(-2)!;
      if (route.request().method() === "GET") {
        const matching = [...audits]
          .reverse()
          .filter((audit) => audit.entryId === entryId);
        const number = Number(url.searchParams.get("page") ?? 1);
        return route.fulfill({
          json: {
            items: matching.slice((number - 1) * 5, number * 5),
            total: matching.length,
            page: number,
            pageSize: 5,
          },
        });
      }
      expect(route.request().headers().authorization).toBe(
        "Bearer test-review",
      );
      const body = route.request().postDataJSON();
      expect(Object.keys(body).sort()).toEqual(
        [
          "severity",
          "symptomIds",
          "otherSymptoms",
          "shortNote",
          ...(expanded ? ["justification"] : []),
        ].sort(),
      );
      payloads.push(body);
      if (postError)
        return route.fulfill({
          status: postError,
          json: {
            error: {
              code: postError === 409 ? "ENTRY_STATE_CONFLICT" : "UNAVAILABLE",
              message: "Failed",
            },
          },
        });
      const current = states.get(entryId)!;
      const stamp = new Date().toISOString();
      const audit: Reassessment = {
        id: `audit-${audits.length + 1}`,
        entryId,
        previousSeverity: current.severity as Reassessment["previousSeverity"],
        newSeverity: body.severity,
        occurredAt: stamp,
        createdAt: stamp,
        createdByUserId: user.id,
        observationSnapshot: body.shortNote,
        ...(expanded ? { justification: body.justification } : {}),
        symptomsSnapshot: {
          symptoms: body.symptomIds.map((id: string) => ({
            id,
            name: "Sintoma cadastrado",
          })),
          otherSymptoms: body.otherSymptoms,
        },
      };
      audits.push(audit);
      states.set(entryId, {
        severity: body.severity,
        symptomIds: body.symptomIds,
        otherSymptoms: body.otherSymptoms,
        shortNote: body.shortNote,
        updatedAt: stamp,
      });
      return route.fulfill({ status: 201, json: audit });
    }
    if (path.includes("/entries/")) {
      detailCalls++;
      if (failDetail)
        return route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Indisponível" } },
        });
      const entry = entries.find((entry) => path.endsWith(entry.entryId))!;
      return route.fulfill({
        json: {
          id: entry.entryId,
          patientId: `patient-${entry.entryId}`,
          status: "waiting",
          enteredAt: "2026-10-24T10:00:00Z",
          queueCode: entry.queueCode,
          ...states.get(entry.entryId),
          patient: {
            id: `patient-${entry.entryId}`,
            fullName: entry.fullName,
            birthDate: null,
          },
          doctor: null,
        },
      });
    }
    return route.fulfill({
      status: 503,
      json: { error: { code: "UNMOCKED_ENDPOINT" } },
    });
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
    audits: () => audits,
    payloads: () => payloads,
    failPost: (status = 503) => {
      postError = status;
    },
    recoverPost: () => {
      postError = 0;
    },
    seedHistory: (count: number) => {
      for (let n = 0; n < count; n++)
        audits.push({
          id: `historic-${n}`,
          entryId: "entry-second",
          previousSeverity: "VERDE",
          newSeverity: "VERDE",
          occurredAt: new Date(
            Date.parse("2026-10-24T11:00:00Z") + n * 60_000,
          ).toISOString(),
          createdAt: "2026-10-24T11:00:00Z",
          createdByUserId: user.id,
          observationSnapshot: `Justificativa histórica ${n}`,
          symptomsSnapshot: {
            symptoms: [],
            otherSymptoms: "Queixa de uma reavaliação anterior",
          },
        });
    },
    revise: () => {
      states.get("entry-second")!.severity = "AMARELO";
    },
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
  const { open, audits, payloads } = await setup(page);
  await open();
  const modal = page.getByRole("dialog");
  await modal.getByRole("radio", { name: /Urgente/ }).check();
  const reason = modal.getByRole("textbox", { name: /Motivo da alteração/ });
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
    /50%/,
  );
  expect(audits()).toHaveLength(1);
  expect(audits()[0]).toMatchObject({
    entryId: "entry-second",
    previousSeverity: "VERDE",
    newSeverity: "VERMELHO",
    createdByUserId: user.id,
    observationSnapshot: "Reavaliação clínica justificada pelo responsável.",
  });
  expect(payloads()[0]).toMatchObject({
    severity: "VERMELHO",
    symptomIds: [],
    otherSymptoms: "Queixa inicial informada",
    shortNote: "Reavaliação clínica justificada pelo responsável.",
  });
  expect(Number.isNaN(Date.parse(audits()[0].occurredAt))).toBe(false);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("av:reception-reassessments:v1:review-user"),
    ),
  ).toBeNull();
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
    .getByRole("textbox", { name: /Motivo da alteração/ })
    .fill("Motivo clínico informado para a reavaliação.");
  controls.fail();
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal.getByRole("alert")).toBeVisible();
  await expect(page.locator(".reception-priority-led")).toHaveCount(0);
  await expect(
    modal.getByRole("textbox", { name: /Motivo da alteração/ }),
  ).toHaveValue("Motivo clínico informado para a reavaliação.");
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
  await expect(
    modal.getByRole("textbox", { name: /Sintomas \/ queixa/ }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    modal.getByRole("textbox", { name: /Motivo da alteração/ }),
  ).toBeFocused();
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

test("erro no POST preserva rascunho, não dispara LED e permite tentar novamente", async ({
  page,
}) => {
  const controls = await setup(page);
  await controls.open();
  const modal = page.getByRole("dialog");
  await modal.getByRole("radio", { name: /Urgente/ }).check();
  await modal
    .getByRole("textbox", { name: /Motivo da alteração/ })
    .fill("Justificativa clínica com tamanho suficiente.");
  controls.failPost();
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal.getByRole("alert")).toBeVisible();
  await expect(
    modal.getByRole("textbox", { name: /Motivo da alteração/ }),
  ).toHaveValue("Justificativa clínica com tamanho suficiente.");
  await expect(page.locator(".reception-priority-led")).toHaveCount(0);
  expect(controls.audits()).toHaveLength(0);
  controls.recoverPost();
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal).toHaveCount(0);
  expect(controls.audits()).toHaveLength(1);
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
      .getByRole("textbox", { name: /Motivo da alteração/ })
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
    .getByRole("textbox", { name: /Motivo da alteração/ })
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
    .getByRole("textbox", { name: /Motivo da alteração/ })
    .fill("Segunda reavaliação clínica com nova justificativa.");
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(led).toHaveAttribute("data-priority", "AMARELO");
});

test("sintomas podem mudar sem trocar gravidade e histórico vem do servidor", async ({
  page,
}) => {
  const controls = await setup(page, "VERDE", [
    "00000000-0000-4000-8000-000000000001",
  ]);
  await controls.open();
  const modal = page.getByRole("dialog");
  await modal
    .getByRole("textbox", { name: /Motivo da alteração/ })
    .fill("Paciente relata mudança na queixa principal.");
  await expect(
    modal.getByRole("button", { name: "Salvar Alteração" }),
  ).toBeDisabled();
  await modal
    .getByRole("textbox", { name: /Sintomas \/ queixa/ })
    .fill("Queixa atualizada após reavaliação.");
  await modal.getByRole("checkbox", { name: /Manter os/ }).uncheck();
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal).toHaveCount(0);
  expect(controls.payloads()[0]).toMatchObject({
    severity: "VERDE",
    symptomIds: [],
    otherSymptoms: "Queixa atualizada após reavaliação.",
  });
  const row = page.locator('tr[data-priority-entry="entry-second"]');
  await expect(row).toContainText("Queixa atualizada após reavaliação.");
  await expect(row).toContainText("Aguardando");
  await row.getByRole("button", { name: "Ver detalhes" }).click();
  const history = page.getByRole("region", {
    name: "Histórico de reavaliações",
  });
  await expect(
    history.getByText("Paciente relata mudança na queixa principal."),
  ).toBeVisible();
  await expect(history.getByText(/Joana da Sessão/)).toBeVisible();
});

test("mudança concorrente é detectada e overrides locais antigos são ignorados", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "av:reception-reassessments:v1:review-user",
      JSON.stringify({
        records: [{ id: "old", entryId: "entry-second", newLevel: "VERMELHO" }],
      }),
    ),
  );
  const controls = await setup(page);
  await expect(
    page.locator('tr[data-priority-entry="entry-second"]'),
  ).toHaveClass(/calm/);
  await controls.open();
  const modal = page.getByRole("dialog");
  await modal.getByRole("radio", { name: /Urgente/ }).check();
  await modal
    .getByRole("textbox", { name: /Motivo da alteração/ })
    .fill("Justificativa clínica para prioridade urgente.");
  controls.revise();
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal.getByRole("alert")).toContainText(
    "mudou durante a edição",
  );
  expect(controls.payloads()).toHaveLength(0);
  await expect(
    modal.getByRole("textbox", { name: /Motivo da alteração/ }),
  ).toHaveValue("Justificativa clínica para prioridade urgente.");
});

test("conflito 409 mantém modal e formulário sem sucesso falso", async ({
  page,
}) => {
  const controls = await setup(page);
  await controls.open();
  const modal = page.getByRole("dialog");
  await modal.getByRole("radio", { name: /Urgente/ }).check();
  await modal
    .getByRole("textbox", { name: /Motivo da alteração/ })
    .fill("Justificativa clínica para confirmar gravidade.");
  controls.failPost(409);
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal.getByRole("alert")).toContainText(
    "estado deste atendimento mudou",
  );
  await expect(modal.getByRole("radio", { name: /Urgente/ })).toBeChecked();
  expect(controls.audits()).toHaveLength(0);
  await expect(page.locator(".reception-priority-led")).toHaveCount(0);
});

test("durante POST pendente bloqueia duplicação e aguarda confirmação antes de fechar", async ({
  page,
}) => {
  const controls = await setup(page);
  await controls.open();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/entries/entry-second/reassessments", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.fallback();
  });
  const modal = page.getByRole("dialog");
  await modal.getByRole("radio", { name: /Urgente/ }).check();
  await modal
    .getByRole("textbox", { name: /Motivo da alteração/ })
    .fill("Reavaliação clínica aguardando confirmação.");
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(
    modal.getByRole("button", { name: "Salvando..." }),
  ).toBeDisabled();
  await expect(
    modal.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeDisabled();
  await expect(
    modal.getByRole("button", { name: "Fechar reavaliação" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();
  await expect(page.locator(".reception-priority-led")).toHaveCount(0);
  release();
  await expect(modal).toHaveCount(0);
  expect(controls.payloads()).toHaveLength(1);
  expect(controls.audits()).toHaveLength(1);
});

test("histórico de reavaliações pagina registros do servidor", async ({
  page,
}) => {
  const controls = await setup(page);
  controls.seedHistory(6);
  await page
    .locator('tr[data-priority-entry="entry-second"]')
    .getByRole("button", { name: "Ver detalhes" })
    .click();
  const history = page.getByRole("region", {
    name: "Histórico de reavaliações",
  });
  await expect(
    history.getByText("Página 1 de 2 · 6 registro(s)"),
  ).toBeVisible();
  await expect(history.locator("li")).toHaveCount(5);
  await history.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(
    history.getByText("Página 2 de 2 · 6 registro(s)"),
  ).toBeVisible();
  await expect(history.locator("li")).toHaveCount(1);
  await expect(history.getByText("Justificativa histórica 0")).toBeVisible();
});

test("contrato ampliado usa justification e preserva observação operacional", async ({
  page,
}) => {
  const controls = await setup(page, "VERDE", [], true);
  await controls.open();
  const modal = page.getByRole("dialog");
  const reason = "Justificativa da reavaliação no contrato ampliado.";
  await modal.getByRole("radio", { name: /Urgente/ }).check();
  await modal
    .getByRole("textbox", { name: /Motivo da alteração/ })
    .fill(reason);
  await modal
    .getByRole("textbox", { name: /Sintomas \/ queixa/ })
    .fill("Descrição clínica confirmada pelo servidor.");
  await modal.getByRole("button", { name: "Salvar Alteração" }).click();
  await expect(modal).toHaveCount(0);
  expect(controls.payloads()[0]).toMatchObject({
    justification: reason,
    shortNote: "Observação operacional original",
  });
  expect(controls.audits()[0]).toMatchObject({
    justification: reason,
    observationSnapshot: "Observação operacional original",
  });
  const row = page.locator('tr[data-priority-entry="entry-second"]');
  await expect(row).toHaveClass(/urgent/);
  await expect(row).toContainText(
    "Descrição clínica confirmada pelo servidor.",
  );
  await row.getByRole("button", { name: "Ver detalhes" }).click();
  await expect(
    page
      .getByRole("region", { name: "Histórico de reavaliações" })
      .getByText(reason, { exact: true }),
  ).toBeVisible();
});

test("fila ampliada mantém gravidade, queixa e espera quando um detalhe falha", async ({
  page,
}) => {
  const controls = await setup(page, "AMARELO", [], true);
  controls.fail();
  await page.getByRole("button", { name: "Atualizar fila" }).click();
  await expect(
    page.getByText(/Não foi possível consultar os dados clínicos de 2/),
  ).toBeVisible();
  const row = page.locator('tr[data-priority-entry="entry-second"]');
  await expect(row).toHaveClass(/alert/);
  await expect(row).toContainText("Queixa inicial informada");
  await expect(row).toContainText("Aguardando");
  await expect(row.locator(".reception-wait")).toContainText("min");
  await expect(page.locator(".reception-risks .alert strong")).toContainText(
    "2 Alertas",
  );
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Gravidade / cor", exact: true })
    .selectOption("AMARELO");
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

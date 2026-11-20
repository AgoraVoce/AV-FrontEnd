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
    symptoms: [
      { id: "e04723dc-96e6-48dc-8cb8-462c6811c203", name: "Sintoma sintético" },
    ],
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

async function login(
  page: Page,
  initialDraft: {
    description: string;
    medications: unknown[];
    notes: string | null;
  } | null = null,
  waitForDraftRead?: Promise<void>,
) {
  let serverDraft = initialDraft;
  let draftVersion = initialDraft ? 7 : 0;
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
  await page.route(
    `**/api/v1/entries/${entryId}/prescription-draft`,
    async (route) => {
      const method = route.request().method();
      const headers = route.request().headers();
      if (method === "GET") {
        await waitForDraftRead;
        await route.fulfill({
          status: 200,
          headers: serverDraft ? { ETag: `"draft-v${draftVersion}"` } : {},
          json: {
            entryId,
            draft: serverDraft
              ? {
                  ...serverDraft,
                  version: draftVersion,
                  createdAt: "2026-11-12T09:15:00.000Z",
                  updatedAt: "2026-11-12T09:15:00.000Z",
                }
              : null,
          },
        });
        return;
      }
      if (method === "PUT") {
        if (
          (serverDraft && headers["if-match"] !== `"draft-v${draftVersion}"`) ||
          (!serverDraft && headers["if-none-match"] !== "*")
        ) {
          await route.fulfill({
            status: 412,
            json: { error: { code: "PRESCRIPTION_DRAFT_STALE" } },
          });
          return;
        }
        serverDraft = route.request().postDataJSON();
        draftVersion += 1;
        await route.fulfill({
          status: draftVersion === 1 ? 201 : 200,
          headers: { ETag: `"draft-v${draftVersion}"` },
          json: {
            entryId,
            draft: {
              ...serverDraft,
              version: draftVersion,
              createdAt: "2026-11-12T09:15:00.000Z",
              updatedAt: "2026-11-12T09:15:00.000Z",
            },
          },
        });
        return;
      }
      if (method === "DELETE") {
        if (serverDraft && headers["if-match"] !== `"draft-v${draftVersion}"`) {
          await route.fulfill({
            status: 412,
            json: { error: { code: "PRESCRIPTION_DRAFT_STALE" } },
          });
          return;
        }
        serverDraft = null;
        await route.fulfill({ status: 204, body: "" });
      }
    },
  );
  await page.route(`**/api/v1/entries/${entryId}/prescription-email`, (route) =>
    route.fulfill({
      json: {
        supported: false,
        eligible: false,
        reasonCode: "SERVICE_UNAVAILABLE",
        latestDelivery: null,
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL("/medico");
}

async function waitForDraftSave(page: Page) {
  await expect(
    page.getByRole("status").filter({
      hasText:
        /^(Rascunho salvo no servidor\.|Versão do servidor carregada\.)$/,
    }),
  ).toBeVisible();
}

test("restaura rascunho remoto versionado e recupera após recarregar e entrar novamente", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  const description = "Conduta fictícia persistida no servidor.";
  await page.getByLabel(/Descrição \/ conduta clínica/).fill(description);
  await waitForDraftSave(page);
  await page.reload();
  await expect(page).toHaveURL("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL("/medico");
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await page.getByRole("button", { name: "Continuar rascunho" }).click();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    description,
  );
  expect(unexpectedRequests).toEqual([]);
});

test("recupera um draft existente com ETag e mantém sintomas da entrada após novo login", async ({
  page,
}) => {
  await login(page, {
    description: "Conduta remota sintética",
    medications: [{ name: "Medicação parcial", dosage: "", instructions: "" }],
    notes: null,
  });
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await page.getByRole("button", { name: "Continuar rascunho" }).click();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    "Conduta remota sintética",
  );
  await expect(page.getByLabel("Nome *").first()).toHaveValue(
    "Medicação parcial",
  );
  await expect(page.getByText("Sintoma sintético").first()).toBeVisible();
  await expect(
    page.getByText("Rascunho salvo no servidor.", { exact: true }),
  ).toBeVisible();
  expect(unexpectedRequests).toEqual([]);
});

test("GET do rascunho que chega depois da edição não substitui o texto digitado", async ({
  page,
}) => {
  let releaseDraftRead: (() => void) | undefined;
  const delayedDraftRead = new Promise<void>((resolve) => {
    releaseDraftRead = resolve;
  });
  await login(page, null, delayedDraftRead);
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await page.getByRole("button", { name: "Prescrever e finalizar" }).click();
  await expect(
    page.getByText("Recuperando rascunho salvo…", { exact: true }),
  ).toBeVisible();
  const field = page.getByLabel(/Descrição \/ conduta clínica/);
  const latestEdit = "Edição local antes da resposta do GET";
  await field.fill(latestEdit);
  releaseDraftRead?.();
  await expect(field).toHaveValue(latestEdit);
  await expect(
    page.getByRole("button", { name: "Revisar antes de finalizar" }),
  ).toBeEnabled();
  await waitForDraftSave(page);
  expect(unexpectedRequests).toEqual([]);
});

test("descarta explicitamente o rascunho remoto com If-Match e confirmação", async ({
  page,
}) => {
  const initialDraft = {
    description: "Conduta remota que será descartada",
    medications: [],
    notes: null,
  };
  await login(page, initialDraft);
  let serverDraft: typeof initialDraft | null = initialDraft;
  const version = 7;
  let deleteCount = 0;
  await page.route(
    `**/api/v1/entries/${entryId}/prescription-draft`,
    async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          headers: serverDraft ? { ETag: `"draft-v${version}"` } : {},
          json: {
            entryId,
            draft: serverDraft
              ? {
                  ...serverDraft,
                  version,
                  createdAt: "2026-11-12T09:15:00.000Z",
                  updatedAt: "2026-11-12T09:15:00.000Z",
                }
              : null,
          },
        });
        return;
      }
      if (method === "DELETE") {
        expect(route.request().headers()["if-match"]).toBe(
          `"draft-v${version}"`,
        );
        deleteCount += 1;
        serverDraft = null;
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      await route.fallback();
    },
  );
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await page.getByRole("button", { name: "Continuar rascunho" }).click();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    initialDraft.description,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Descartar rascunho salvo" }).click();
  await expect(
    page.getByText("Rascunho descartado.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue("");
  expect(deleteCount).toBe(1);
  expect(serverDraft).toBeNull();
  expect(unexpectedRequests).toEqual([]);
});

test("confirma o DELETE após timeout consultando o servidor antes de limpar a edição", async ({
  page,
}) => {
  const initialDraft = {
    description: "Conduta remota removida apesar do timeout",
    medications: [],
    notes: null,
  };
  await login(page, initialDraft);
  let serverDraft: typeof initialDraft | null = initialDraft;
  let version = 7;
  let deleteCount = 0;
  await page.route(
    `**/api/v1/entries/${entryId}/prescription-draft`,
    async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          headers: serverDraft ? { ETag: `"draft-v${version}"` } : {},
          json: {
            entryId,
            draft: serverDraft
              ? {
                  ...serverDraft,
                  version,
                  createdAt: "2026-11-12T09:15:00.000Z",
                  updatedAt: "2026-11-12T09:15:00.000Z",
                }
              : null,
          },
        });
        return;
      }
      if (method === "DELETE") {
        expect(route.request().headers()["if-match"]).toBe(
          `"draft-v${version}"`,
        );
        deleteCount += 1;
        serverDraft = null;
        version += 1;
        await route.abort("failed");
        return;
      }
      await route.fallback();
    },
  );
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await page.getByRole("button", { name: "Continuar rascunho" }).click();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    initialDraft.description,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Descartar rascunho salvo" }).click();
  await expect(
    page.getByText("Descarte confirmado no servidor.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue("");
  expect(deleteCount).toBe(1);
  expect(serverDraft).toBeNull();
  expect(unexpectedRequests).toEqual([]);
});

test("envia apenas após consentimento, usa idempotência e separa accepted de delivered", async ({
  page,
}) => {
  await login(page);
  const completed = entry(
    "completed",
    persistedPrescription("Conduta confirmada sintética."),
  );
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({ json: completed }),
  );
  let latestDelivery: Record<string, unknown> | null = null;
  let requestCount = 0;
  let staleStatusRead = true;
  await page.route(
    `**/api/v1/entries/${entryId}/prescription-email`,
    async (route) => {
      if (route.request().method() === "GET") {
        const visibleDelivery =
          requestCount > 0 && staleStatusRead
            ? ((staleStatusRead = false), null)
            : latestDelivery;
        await route.fulfill({
          json: {
            supported: true,
            eligible: true,
            reasonCode: null,
            latestDelivery: visibleDelivery,
          },
        });
        return;
      }
      requestCount += 1;
      expect(route.request().postDataJSON()).toEqual({});
      const headers = route.request().headers();
      expect(headers["x-patient-consent"]).toBe("confirmed");
      expect(headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/i);
      latestDelivery = {
        deliveryId: "4c3b7dd5-a88d-4bd4-b6cd-dd16bc0d3573",
        status: "accepted",
        requestedAt: "2026-11-12T09:36:00.000Z",
        updatedAt: "2026-11-12T09:36:00.000Z",
        acceptedAt: "2026-11-12T09:36:00.000Z",
        deliveredAt: null,
        failureCode: null,
      };
      await route.fulfill({
        status: 202,
        json: {
          deliveryId: latestDelivery.deliveryId,
          entryId,
          status: "accepted",
          requestedAt: "2026-11-12T09:36:00.000Z",
        },
      });
    },
  );
  await page.evaluate((path) => {
    history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/medico/prescricoes/${entryId}`);
  await expect(
    page.getByRole("button", { name: "Enviar prescrição por e-mail" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Enviar prescrição por e-mail" })
    .click();
  const confirm = page.getByRole("button", { name: "Confirmar e solicitar" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Confirmo que o paciente consentiu/).check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.getByText(
      "E-mail aceito pelo provedor; entrega ainda não confirmada",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(page.getByText(/E-mail entregue/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enviar prescrição por e-mail" }),
  ).toBeDisabled();
  latestDelivery = {
    ...latestDelivery,
    status: "delivered",
    deliveredAt: "2026-11-12T09:40:00.000Z",
    updatedAt: "2026-11-12T09:40:00.000Z",
  };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("E-mail entregue", { exact: true }),
  ).toBeVisible();
  expect(requestCount).toBe(1);
  expect(unexpectedRequests).toEqual([]);
});

test("resultado incerto do envio não permite repetir nem troca a chave automaticamente", async ({
  page,
}) => {
  await login(page);
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({
      json: entry("completed", persistedPrescription("Conduta sintética.")),
    }),
  );
  let postCount = 0;
  let issuedKey = "";
  await page.route(
    `**/api/v1/entries/${entryId}/prescription-email`,
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: {
            supported: true,
            eligible: true,
            reasonCode: null,
            latestDelivery: null,
          },
        });
        return;
      }
      postCount += 1;
      issuedKey = route.request().headers()["idempotency-key"];
      await route.abort("failed");
    },
  );
  await page.evaluate((path) => {
    history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/medico/prescricoes/${entryId}`);
  await page
    .getByRole("button", { name: "Enviar prescrição por e-mail" })
    .click();
  await page.getByLabel(/Confirmo que o paciente consentiu/).check();
  await page.getByRole("button", { name: "Confirmar e solicitar" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /não será repetido automaticamente/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar prescrição por e-mail" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Verificar estado do envio" }).click();
  expect(postCount).toBe(1);
  expect(issuedKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(unexpectedRequests).toEqual([]);
});

for (const status of [409, 429, 503]) {
  test(`resultado HTTP ${status} do envio exige reconciliação e não repete POST`, async ({
    page,
  }) => {
    await login(page);
    await page.route(`**/api/v1/entries/${entryId}`, (route) =>
      route.fulfill({
        json: entry("completed", persistedPrescription("Conduta sintética.")),
      }),
    );
    let postCount = 0;
    let issuedKey = "";
    await page.route(
      `**/api/v1/entries/${entryId}/prescription-email`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            json: {
              supported: true,
              eligible: true,
              reasonCode: null,
              latestDelivery: null,
            },
          });
          return;
        }
        postCount += 1;
        issuedKey = route.request().headers()["idempotency-key"];
        expect(issuedKey).toMatch(/^[0-9a-f-]{36}$/i);
        expect(route.request().headers()["x-patient-consent"]).toBe(
          "confirmed",
        );
        expect(route.request().postDataJSON()).toEqual({});
        await route.fulfill({
          status,
          json: { error: { code: "DELIVERY_RESULT_UNCERTAIN" } },
        });
      },
    );
    await page.evaluate((path) => {
      history.pushState(null, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/medico/prescricoes/${entryId}`);
    await page
      .getByRole("button", { name: "Enviar prescrição por e-mail" })
      .click();
    await page.getByLabel(/Confirmo que o paciente consentiu/).check();
    await page.getByRole("button", { name: "Confirmar e solicitar" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /não será repetido automaticamente/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enviar prescrição por e-mail" }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Verificar estado do envio" })
      .click();
    expect(postCount).toBe(1);
    expect(issuedKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(unexpectedRequests).toEqual([]);
  });
}

test("acompanha os estados reais do envio sem permitir novo POST enquanto não falhou", async ({
  page,
}) => {
  await login(page);
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({
      json: entry("completed", persistedPrescription("Conduta sintética.")),
    }),
  );
  const latestDelivery: Record<string, unknown> = {
    deliveryId: "438b4653-7d02-457c-a219-ec1ab9989688",
    status: "queued",
    requestedAt: "2026-11-12T09:36:00.000Z",
    updatedAt: "2026-11-12T09:36:00.000Z",
    acceptedAt: null,
    deliveredAt: null,
    failureCode: null,
  };
  await page.route(`**/api/v1/entries/${entryId}/prescription-email`, (route) =>
    route.fulfill({
      json: {
        supported: true,
        eligible: true,
        reasonCode: null,
        latestDelivery,
      },
    }),
  );
  await page.evaluate((path) => {
    history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/medico/prescricoes/${entryId}`);
  const help = page.locator("#prescription-email-help");
  const send = page.getByRole("button", {
    name: "Enviar prescrição por e-mail",
  });
  await expect(help).toHaveText("Solicitação na fila");
  const states = [
    ["processing", "Envio em processamento", false],
    [
      "delivery_delayed",
      "Entrega atrasada; aguardando atualização do provedor",
      false,
    ],
    ["unknown", "Estado do envio desconhecido", false],
    ["failed", "Envio falhou", true],
  ] as const;
  for (const [status, label, enabled] of states) {
    latestDelivery.status = status;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(help).toHaveText(label);
    if (enabled) await expect(send).toBeEnabled();
    else await expect(send).toBeDisabled();
  }
  expect(unexpectedRequests).toEqual([]);
});

test("serializa autosaves e persiste a edição feita enquanto outra gravação está pendente", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  let releaseFirst: (() => void) | undefined;
  let startedFirst: (() => void) | undefined;
  const firstStarted = new Promise<void>((resolve) => {
    startedFirst = resolve;
  });
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const bodies: unknown[] = [];
  const conditions: string[] = [];
  await page.route(
    `**/api/v1/entries/${entryId}/prescription-draft`,
    async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      bodies.push(route.request().postDataJSON());
      const headers = route.request().headers();
      conditions.push(headers["if-match"] ?? headers["if-none-match"] ?? "");
      if (bodies.length === 1) {
        startedFirst?.();
        await firstGate;
        await route.fulfill({
          status: 201,
          headers: { ETag: '"draft-v1"' },
          json: {
            entryId,
            draft: {
              ...(bodies[0] as object),
              version: 1,
              createdAt: "2026-11-12T09:00:00.000Z",
              updatedAt: "2026-11-12T09:00:00.000Z",
            },
          },
        });
      } else
        await route.fulfill({
          status: 200,
          headers: { ETag: '"draft-v2"' },
          json: {
            entryId,
            draft: {
              ...(bodies[bodies.length - 1] as object),
              version: 2,
              createdAt: "2026-11-12T09:00:00.000Z",
              updatedAt: "2026-11-12T09:01:00.000Z",
            },
          },
        });
    },
  );
  const field = page.getByLabel(/Descrição \/ conduta clínica/);
  await field.fill("Primeira gravação sintética");
  await firstStarted;
  await field.fill("Edição posterior durante o primeiro save");
  releaseFirst?.();
  await waitForDraftSave(page);
  expect(bodies).toHaveLength(2);
  expect(conditions).toEqual(["*", '"draft-v1"']);
  expect((bodies[1] as { description: string }).description).toBe(
    "Edição posterior durante o primeiro save",
  );
  expect(unexpectedRequests).toEqual([]);
});

test("reconcilia timeout do PUT pelo GET quando o draft foi persistido", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  let saved: {
    description: string;
    medications: unknown[];
    notes: string | null;
  } | null = null;
  let version = 0;
  await page.route(
    `**/api/v1/entries/${entryId}/prescription-draft`,
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          headers: saved ? { ETag: `"draft-v${version}"` } : {},
          json: {
            entryId,
            draft: saved
              ? {
                  ...saved,
                  version,
                  createdAt: "2026-11-12T09:00:00.000Z",
                  updatedAt: "2026-11-12T09:00:00.000Z",
                }
              : null,
          },
        });
        return;
      }
      if (route.request().method() === "PUT") {
        saved = route.request().postDataJSON();
        version += 1;
        await route.abort("failed");
      } else await route.fallback();
    },
  );
  await page
    .getByLabel(/Descrição \/ conduta clínica/)
    .fill("Conduta persistida apesar do timeout");
  await waitForDraftSave(page);
  expect(saved?.description).toBe("Conduta persistida apesar do timeout");
  expect(unexpectedRequests).toEqual([]);
});

test("conflito 412 mantém a edição e exige carregar explicitamente a versão do servidor", async ({
  page,
}) => {
  await login(page, {
    description: "Versão remota inicial",
    medications: [],
    notes: null,
  });
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await page.getByRole("button", { name: "Continuar rascunho" }).click();
  await page.route(
    `**/api/v1/entries/${entryId}/prescription-draft`,
    async (route) => {
      if (route.request().method() === "PUT") {
        expect(route.request().headers()["if-match"]).toBe('"draft-v7"');
        await route.fulfill({
          status: 412,
          json: { error: { code: "PRESCRIPTION_DRAFT_STALE" } },
        });
      } else await route.fallback();
    },
  );
  const field = page.getByLabel(/Descrição \/ conduta clínica/);
  await field.fill("Edição local preservada após conflito");
  await expect(
    page.getByRole("alert").filter({ hasText: /alterado em outra sessão/ }),
  ).toBeVisible();
  await expect(field).toHaveValue("Edição local preservada após conflito");
  await page
    .getByRole("button", { name: "Carregar versão do servidor" })
    .click();
  await expect(field).toHaveValue("Versão remota inicial");
  await waitForDraftSave(page);
  expect(unexpectedRequests).toEqual([]);
});

test("finalização com ETag antigo é bloqueada e mantém a prescrição para resolução", async ({
  page,
}) => {
  await login(page, {
    description: "Conduta remota validada",
    medications: [],
    notes: null,
  });
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await page.getByRole("button", { name: "Continuar rascunho" }).click();
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  let completionCount = 0;
  await page.route(`**/api/v1/entries/${entryId}/complete`, async (route) => {
    completionCount += 1;
    expect(route.request().headers()["if-match"]).toBe('"draft-v7"');
    await route.fulfill({
      status: 412,
      json: { error: { code: "PRESCRIPTION_DRAFT_STALE" } },
    });
  });
  await page.route(`**/api/v1/entries/${entryId}`, (route) =>
    route.fulfill({ json: entry("in_progress") }),
  );
  await page.getByRole("button", { name: "Confirmar finalização" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /A finalização não foi confirmada/ }),
  ).toBeVisible();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    "Conduta remota validada",
  );
  await expect(
    page.getByRole("button", { name: "Carregar versão do servidor" }),
  ).toBeVisible();
  expect(completionCount).toBe(1);
  await page
    .getByRole("button", { name: "Carregar versão do servidor" })
    .click();
  await expect(page.getByLabel(/Descrição \/ conduta clínica/)).toHaveValue(
    "Conduta remota validada",
  );
  await waitForDraftSave(page);
  expect(unexpectedRequests).toEqual([]);
});

test("precondição 428 preserva o texto e informa falha de salvamento sem criar rascunho local persistente", async ({
  page,
}) => {
  await openCurrentAppointment(page);
  let writes = 0;
  await page.route(
    `**/api/v1/entries/${entryId}/prescription-draft`,
    async (route) => {
      if (route.request().method() === "PUT") {
        writes += 1;
        expect(route.request().headers()["if-none-match"]).toBe("*");
        await route.fulfill({
          status: 428,
          json: { error: { code: "PRECONDITION_REQUIRED" } },
        });
      } else await route.fallback();
    },
  );
  const field = page.getByLabel(/Descrição \/ conduta clínica/);
  await field.fill("Conduta mantida após precondição ausente");
  await expect(
    page.getByRole("alert").filter({ hasText: /Atualize o rascunho/i }),
  ).toBeVisible();
  await expect(field).toHaveValue("Conduta mantida após precondição ausente");
  expect(writes).toBe(1);
  const storage = await page.evaluate(() =>
    Object.values(localStorage).concat(Object.values(sessionStorage)).join(" "),
  );
  expect(storage).not.toContain("Conduta mantida após precondição ausente");
  expect(unexpectedRequests).toEqual([]);
});

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
  await waitForDraftSave(page);
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  await expect(
    page.getByText("Pré-visualização — conteúdo não salvo"),
  ).toBeVisible();
  await expect(page.getByText("Sintoma sintético").first()).toBeVisible();
  await expect(
    page.getByText("Queixa sintética para teste").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Observação fictícia de entrada").first(),
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
  let completionEtag = "";
  const confirmed = entry("completed", persistedPrescription(description));
  await page.route(`**/api/v1/entries/${entryId}/complete`, async (route) => {
    completionCount += 1;
    completionBody = route.request().postDataJSON();
    completionEtag = route.request().headers()["if-match"];
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
  await expect(page.getByText("Sintoma sintético").first()).toBeVisible();
  await expect(
    page.getByText("Queixa sintética para teste").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Observação fictícia de entrada").first(),
  ).toBeVisible();
  await expect(page.locator(".av-toast-stack .av-toast")).toHaveCount(0);
  expect(completionCount).toBe(1);
  expect(completionEtag).toBe('"draft-v1"');
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
    page.getByText("O serviço de envio não está habilitado no servidor."),
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
  await waitForDraftSave(page);
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  await expect(description).toBeFocused();
  const maximumDescription = "a".repeat(5000);
  await description.fill("a".repeat(5001));
  await expect(description).toHaveValue(maximumDescription);
  await waitForDraftSave(page);
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  await expect(page.locator(".prescription-document-text").first()).toHaveText(
    maximumDescription,
  );
  await page.getByRole("button", { name: "Voltar para edição" }).click();
  await description.fill("");
  await description.fill("Conduta sintética com medicação opcional.");
  await waitForDraftSave(page);
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
  await waitForDraftSave(page);
  await page.getByRole("button", { name: "Adicionar medicamento" }).click();
  await page.getByLabel("Nome *").nth(1).fill("Segunda medicação fictícia");
  await page.getByLabel("Dosagem *").nth(1).fill("2 unidades");
  await page
    .getByLabel("Instruções *")
    .nth(1)
    .fill("Segunda orientação de teste.");
  await waitForDraftSave(page);
  await page
    .getByRole("button", { name: "Revisar antes de finalizar" })
    .click();
  await expect(
    page.getByText("Segunda medicação fictícia", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar para edição" }).click();
  await page.getByLabel("Orientações adicionais").fill("Orientação de teste.");
  await waitForDraftSave(page);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL("/medico");
  await page.getByRole("link", { name: "Paciente atual", exact: true }).click();
  await expect(page).toHaveURL("/medico/atendimento");
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
  await waitForDraftSave(page);
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
  await page
    .locator('form[aria-label="Prescrição e finalização"]')
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  expect(completionCount).toBe(1);
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
  await waitForDraftSave(page);
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
  await waitForDraftSave(page);
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
    await waitForDraftSave(page);
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
  await waitForDraftSave(page);
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

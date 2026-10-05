import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const email = "pessoa@clinica.test";
const password = "  uma frase nova e segura 🩺  ";
const challenge = {
  challengeId: "challenge-test",
  codeLength: 6,
  expiresInSeconds: 300,
  resendAfterSeconds: 2,
  passwordPolicy: { minLength: 15, maxLength: 128 },
};
const grant = { resetToken: "grant-test-secret", expiresInSeconds: 300 };
type Handler = (route: Route) => Promise<void>;
async function mockApi(
  page: Page,
  overrides: { request?: Handler; verify?: Handler; reset?: Handler } = {},
) {
  const calls: Record<string, unknown[]> = {
    request: [],
    verify: [],
    reset: [],
  };
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401 }));
  for (const [operation, payload] of [
    ["request", challenge],
    ["verify", grant],
    ["reset", null],
  ] as const) {
    await page.route(`**/auth/password/${operation}`, async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().url()).not.toContain("?");
      calls[operation].push(route.request().postDataJSON());
      if (overrides[operation]) await overrides[operation](route);
      else if (payload) await route.fulfill({ json: payload });
      else await route.fulfill({ status: 204 });
    });
  }
  return calls;
}
async function start(page: Page) {
  await page.goto("/recuperar-senha");
  await expect(
    page.getByRole("heading", { name: "Recupere seu acesso." }),
  ).toBeFocused();
}
async function codeStep(page: Page) {
  await start(page);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Enviar código", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confira seu e-mail." }),
  ).toBeFocused();
}
async function passwordStep(page: Page) {
  await codeStep(page);
  await page.getByLabel("Código de verificação").fill("123456");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await expect(
    page.getByRole("heading", { name: "Crie uma nova senha." }),
  ).toBeFocused();
}
async function fillPassword(page: Page, value = password) {
  await page.getByLabel("Nova senha", { exact: true }).fill(value);
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill(value);
}
async function doubleSubmit(page: Page) {
  await page.locator("form").evaluate((form) => {
    for (let index = 0; index < 2; index++)
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
  });
}

test("link de login e campos disponíveis mesmo com falha de sessão", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/auth/me", (route) => route.fulfill({ status: 503 }));
  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL("/recuperar-senha");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await expect(
    page.getByRole("button", { name: "Enviar código", exact: true }),
  ).toBeEnabled();
});
test("e-mail vazio/inválido: foco, erro associado e zero chamadas", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await start(page);
  await page
    .getByRole("button", { name: "Enviar código", exact: true })
    .click();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeFocused();
  await expect(page.getByText("Informe seu e-mail.")).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill("invalido");
  await page
    .getByRole("button", { name: "Enviar código", exact: true })
    .click();
  await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
  expect(calls.request).toHaveLength(0);
});
for (const account of ["existente", "inexistente", "inativa"]) {
  test(`solicitação ${account}: mesma resposta genérica, sem revelar cadastro`, async ({
    page,
  }) => {
    await mockApi(page);
    await codeStep(page);
    await expect(
      page.getByText(/Se houver uma conta para esse e-mail/),
    ).toBeVisible();
    await expect(page.getByLabel("Código de verificação")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
    await expect(
      page.getByRole("button", { name: "Reenviar em 2s" }),
    ).toBeDisabled();
  });
}
test("fluxo completo envia somente contrato e volta ao login sem autenticar", async ({
  page,
}) => {
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  const calls = await mockApi(page);
  await passwordStep(page);
  await fillPassword(page);
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(
    page.getByRole("heading", { name: "Senha redefinida." }),
  ).toBeFocused();
  expect(calls.request).toEqual([{ email }]);
  expect(calls.verify).toEqual([
    { challengeId: challenge.challengeId, code: "123456" },
  ]);
  expect(calls.reset).toEqual([{ resetToken: grant.resetToken, password }]);
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      history: history.state,
      url: location.href,
    }),
  );
  for (const secret of [password, grant.resetToken, "123456"])
    expect(`${logs.join("\n")} ${storage}`).not.toContain(secret);
  await page.getByRole("link", { name: "Voltar para entrar" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
});
for (const operation of ["request", "verify", "reset"] as const) {
  test(`duplo submit ${operation}: uma chamada, campos bloqueados até resposta`, async ({
    page,
  }) => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const calls = await mockApi(page, {
      [operation]: async (route: Route) => {
        await pending;
        await route.fulfill({ status: 503 });
      },
    });
    if (operation === "request") {
      await start(page);
      await page.getByLabel("E-mail", { exact: true }).fill(email);
    } else if (operation === "verify") {
      await codeStep(page);
      await page.getByLabel("Código de verificação").fill("123456");
    } else {
      await passwordStep(page);
      await fillPassword(page);
    }
    await doubleSubmit(page);
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => calls[operation].length).toBe(1);
    await expect(page.locator("form input").first()).toBeDisabled();
    finish();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("form input").first()).toBeEnabled();
  });
}
for (const operation of ["request", "verify", "reset"] as const) {
  for (const failure of ["rede", "503", "429"] as const) {
    test(`${operation}: ${failure} não avança, permite retry sem expor mensagem`, async ({
      page,
    }) => {
      let failing = true;
      const calls = await mockApi(page, {
        [operation]: async (route: Route) => {
          if (failing) {
            if (failure === "rede") await route.abort("failed");
            else
              await route.fulfill({
                status: Number(failure),
                json: { message: "detalhe privado" },
              });
          } else if (operation === "reset")
            await route.fulfill({ status: 204 });
          else
            await route.fulfill({
              json: operation === "request" ? challenge : grant,
            });
        },
      });
      if (operation === "request") {
        await start(page);
        await page.getByLabel("E-mail", { exact: true }).fill(email);
      } else if (operation === "verify") {
        await codeStep(page);
        await page.getByLabel("Código de verificação").fill("123456");
      } else {
        await passwordStep(page);
        await fillPassword(page);
      }
      const submit = page.locator("button[type=submit]");
      await submit.click();
      await expect(page.getByRole("alert")).toContainText(
        failure === "429"
          ? "Muitas tentativas"
          : operation === "reset"
            ? "Não foi possível confirmar"
            : "indisponível",
      );
      await expect(page.getByText("detalhe privado")).toHaveCount(0);
      if (operation === "reset")
        await expect(
          page.getByLabel("Nova senha", { exact: true }),
        ).toHaveValue(password);
      failing = false;
      await submit.click();
      await expect.poll(() => calls[operation].length).toBe(2);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        operation === "request"
          ? "Confira seu e-mail."
          : operation === "verify"
            ? "Crie uma nova senha."
            : "Senha redefinida.",
      );
    });
  }
}
for (const status of [401, 410]) {
  test(`código inválido/expirado ${status}: genérico, foco no código, sem grant`, async ({
    page,
  }) => {
    await mockApi(page, {
      verify: (route) =>
        route.fulfill({ status, json: { message: "Conta inexistente" } }),
    });
    await codeStep(page);
    await page.getByLabel("Código de verificação").fill("123456");
    await page.getByRole("button", { name: "Verificar código" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Código inválido ou expirado.",
    );
    await expect(page.getByLabel("Código de verificação")).toBeFocused();
    await expect(page.getByLabel("Nova senha", { exact: true })).toHaveCount(0);
  });
}
test("código incompleto ou não numérico não chama verify; paste com espaços funciona", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await codeStep(page);
  for (const value of ["", "123", "12abcd"]) {
    await page.getByLabel("Código de verificação").fill(value);
    await page.getByRole("button", { name: "Verificar código" }).click();
    await expect(
      page.getByText("Informe os 6 dígitos do código."),
    ).toBeVisible();
  }
  expect(calls.verify).toHaveLength(0);
  await page.getByLabel("Código de verificação").evaluate((input) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "123 456");
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByLabel("Código de verificação")).toHaveValue("123456");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
});
test("expiração do código, espera de reenvio e novo challenge invalidam estado anterior", async ({
  page,
}) => {
  await page.clock.install();
  let requests = 0;
  const calls = await mockApi(page, {
    request: (route) =>
      route.fulfill({
        json: {
          ...challenge,
          challengeId: `challenge-${++requests}`,
          expiresInSeconds: 2,
        },
      }),
  });
  await codeStep(page);
  await page.getByLabel("Código de verificação").fill("123456");
  await page.clock.runFor(3000);
  await expect(
    page.getByText("Código expirado. Solicite um novo abaixo."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verificar código" }),
  ).toBeDisabled();
  expect(calls.verify).toHaveLength(0);
  await page
    .getByRole("button", { name: "Reenviar código", exact: true })
    .click();
  await expect(page.getByLabel("Código de verificação")).toHaveValue("");
  await page.getByLabel("Código de verificação").fill("654321");
  await page.getByRole("button", { name: "Verificar código" }).click();
  expect(calls.verify).toEqual([
    { challengeId: "challenge-2", code: "654321" },
  ]);
});
test("reenvio bloqueia duplicidade e falha preserva challenge para retry", async ({
  page,
}) => {
  await page.clock.install();
  let requests = 0;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const calls = await mockApi(page, {
    request: async (route) => {
      if (++requests === 2) {
        await pending;
        await route.fulfill({ status: 503 });
      } else await route.fulfill({ json: challenge });
    },
  });
  await codeStep(page);
  await page.getByLabel("Código de verificação").fill("123456");
  await page.clock.runFor(2100);
  await page
    .getByRole("button", { name: "Reenviar código", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect.poll(() => calls.request.length).toBe(2);
  await expect(
    page.getByRole("button", { name: "Solicitando novo código…" }),
  ).toBeDisabled();
  finish();
  await expect(page.getByRole("alert")).toContainText("indisponível");
  await expect(page.getByLabel("Código de verificação")).toHaveValue("123456");
  await page
    .getByRole("button", { name: "Reenviar código", exact: true })
    .click();
  await expect(page.getByLabel("Código de verificação")).toHaveValue("");
});
test("senha obrigatória, limites da API e confirmação: zero reset inválido", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await passwordStep(page);
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeFocused();
  await expect(page.getByText("Confirme sua nova senha.")).toBeVisible();
  for (const value of ["curta", "a".repeat(129)]) {
    await fillPassword(page, value);
    await page.getByRole("button", { name: "Redefinir senha" }).click();
    await expect(
      page.getByText("Use de 15 a 128 caracteres.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Nova senha", { exact: true })).toHaveValue(
      value,
    );
  }
  await fillPassword(page);
  await page
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("outra senha longa");
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByText("As senhas não coincidem.")).toBeVisible();
  await expect(
    page.getByLabel("Confirmar nova senha", { exact: true }),
  ).toBeFocused();
  expect(calls.reset).toHaveLength(0);
});
for (const status of [422, 401]) {
  test(`reset ${status}: política ou grant expirado não confirma sucesso`, async ({
    page,
  }) => {
    await mockApi(page, { reset: (route) => route.fulfill({ status }) });
    await passwordStep(page);
    await fillPassword(page);
    await page.getByRole("button", { name: "Redefinir senha" }).click();
    await expect(page.getByRole("alert")).toContainText(
      status === 422 ? "política de segurança" : "autorização expirou",
    );
    if (status === 401) {
      await expect(page.getByLabel("Nova senha", { exact: true })).toHaveValue(
        "",
      );
      await expect(
        page.getByRole("button", { name: "Redefinir senha" }),
      ).toBeDisabled();
    } else
      await expect(
        page.getByLabel("Nova senha", { exact: true }),
      ).toBeFocused();
    await page.getByRole("button", { name: "Recomeçar recuperação" }).click();
    await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(email);
  });
}
test("grant expira na página sem enviar reset", async ({ page }) => {
  await page.clock.install();
  const calls = await mockApi(page, {
    verify: (route) =>
      route.fulfill({ json: { ...grant, expiresInSeconds: 2 } }),
  });
  await passwordStep(page);
  await fillPassword(page);
  await page.clock.runFor(3000);
  await expect(page.getByRole("alert")).toContainText("autorização expirou");
  await expect(
    page.getByRole("button", { name: "Redefinir senha" }),
  ).toBeDisabled();
  expect(calls.reset).toHaveLength(0);
});
for (const operation of ["request", "verify"] as const) {
  test(`contrato malformado ${operation} bloqueia avanço`, async ({ page }) => {
    await mockApi(page, {
      [operation]: (route: Route) =>
        route.fulfill({ json: { resetToken: "", codeLength: 0 } }),
    });
    if (operation === "request") {
      await start(page);
      await page.getByLabel("E-mail", { exact: true }).fill(email);
    } else {
      await codeStep(page);
      await page.getByLabel("Código de verificação").fill("123456");
    }
    await page.locator("button[type=submit]").click();
    await expect(page.getByRole("alert")).toContainText(
      "Não foi possível continuar",
    );
    await expect(page.getByLabel("Nova senha", { exact: true })).toHaveCount(0);
  });
}
test("refresh e alteração do e-mail descartam código/grant/senhas", async ({
  page,
}) => {
  await mockApi(page);
  await codeStep(page);
  await page.getByLabel("Código de verificação").fill("123456");
  await page.getByRole("button", { name: "Alterar e-mail" }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(email);
  await page
    .getByRole("button", { name: "Enviar código", exact: true })
    .click();
  await expect(page.getByLabel("Código de verificação")).toHaveValue("");
  await page.getByLabel("Código de verificação").fill("123456");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await fillPassword(page);
  await page.reload();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveCount(0);
});
test("saída durante verify cancela resultado tardio e reinicia fluxo", async ({
  page,
}) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await mockApi(page, {
    verify: async (route) => {
      await pending;
      await route.fulfill({ json: grant }).catch(() => {});
    },
  });
  await codeStep(page);
  await page.getByLabel("Código de verificação").fill("123456");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await page.getByRole("link", { name: "Voltar para o login" }).click();
  finish();
  await expect(page).toHaveURL("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(
    page.getByRole("heading", { name: "Recupere seu acesso." }),
  ).toBeVisible();
});
test("timeout encerra loading sem avançar", async ({ page }) => {
  await mockApi(page, { request: async () => {} });
  await start(page);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Enviar código", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("indisponível", {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Enviar código", exact: true }),
  ).toBeEnabled();
});
test("redefinição remove sessão já restaurada e não redireciona automaticamente", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "test", name: "Pessoa", login: email, role: "ADMIN" },
      },
    }),
  );
  await passwordStep(page);
  await fillPassword(page);
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(
    page.getByRole("heading", { name: "Senha redefinida." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Voltar para entrar" }).click();
  await expect(page).toHaveURL("/login");
  await expect(
    page.getByRole("heading", { name: "Bem-vindo de volta." }),
  ).toBeVisible();
});
for (const width of [320, 390, 768, 1024, 1504]) {
  test(`layout e axe nas quatro etapas: ${width}px, código de 12 dígitos`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await mockApi(page, {
      request: (route) =>
        route.fulfill({ json: { ...challenge, codeLength: 12 } }),
    });
    await start(page);
    async function check(name: string) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
      if (width === 1504 || width === 390)
        await page.screenshot({
          path: `../qa/recovery-${name}-${width}.png`,
          fullPage: true,
        });
    }
    await check("email");
    await page
      .getByLabel("E-mail", { exact: true })
      .fill(`${"longo".repeat(30)}@clinica.test`);
    await page
      .getByRole("button", { name: "Enviar código", exact: true })
      .click();
    await expect(page.getByLabel("Código de verificação")).toBeVisible();
    await check("code");
    await page.getByLabel("Código de verificação").fill("123456789012");
    await page.getByRole("button", { name: "Verificar código" }).click();
    await fillPassword(page);
    await page
      .getByRole("button", { name: "Mostrar nova senha", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByLabel("Nova senha", { exact: true }),
    ).toHaveAttribute("type", "text");
    await page
      .getByRole("button", { name: "Mostrar confirmação de senha" })
      .click();
    await expect(
      page.getByLabel("Confirmar nova senha", { exact: true }),
    ).toHaveAttribute("type", "text");
    await page
      .getByRole("button", { name: "Ocultar nova senha", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Ocultar confirmação de senha" })
      .click();
    await check("password");
    await page.getByRole("button", { name: "Redefinir senha" }).click();
    await expect(
      page.getByRole("heading", { name: "Senha redefinida." }),
    ).toBeVisible();
    await check("success");
    expect(errors).toEqual([]);
  });
}

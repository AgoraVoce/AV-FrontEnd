import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Role, User } from "../src/auth/types";
const makeUser = (role: Role): User => ({
  id: "test-user",
  name: "Pessoa de teste",
  login: "operador@clinica.test",
  role,
});
const landingHeadings = {
  "/recepcao": "Fila de Espera e Gestão de Prioridades",
  "/medico": "Dr. Marcelo Arantes",
  "/admin": "Painel Administrativo - Visão Geral do Pronto-Socorro",
} as const;
async function api(
  page: Page,
  {
    role = "RECEPCIONISTA",
    authenticated = false,
    loginStatus = 200,
    loginHandler,
    logoutStatus = 204,
  }: {
    role?: Role;
    authenticated?: boolean;
    loginStatus?: number;
    loginHandler?: (route: Route) => Promise<void>;
    logoutStatus?: number;
  } = {},
) {
  let session = authenticated;
  let calls = 0;
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: session ? 200 : 401,
      json: session
        ? { user: makeUser(role) }
        : { message: "Sessão inválida." },
    }),
  );
  await page.route("**/auth/login", async (route) => {
    calls++;
    if (loginHandler) {
      await loginHandler(route);
      return;
    }
    if (loginStatus === 200) session = true;
    await route.fulfill({
      status: loginStatus,
      json:
        loginStatus === 200
          ? { user: makeUser(role) }
          : { message: "Mensagem sensível do servidor." },
    });
  });
  await page.route("**/auth/logout", async (route) => {
    if (logoutStatus === 204) session = false;
    await route.fulfill({ status: logoutStatus });
  });
  return {
    calls: () => calls,
    expire: () => {
      session = false;
    },
  };
}
async function fill(page: Page) {
  await page
    .getByLabel("Matrícula ou E-mail Institucional", { exact: true })
    .fill("operador@clinica.test");
  await page
    .getByLabel("Senha de Acesso", { exact: true })
    .fill("senha-de-teste");
}
async function open(page: Page, path = "/login") {
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Entrar no sistema" }),
  ).toBeDisabled();
}
test("recepção exibe a fila de espera da área autorizada", async ({ page }) => {
  await api(page, { role: "RECEPCIONISTA", authenticated: true });
  await page.goto("/recepcao");

  await expect(
    page.getByRole("heading", {
      name: "Fila de Espera e Gestão de Prioridades",
    }),
  ).toBeVisible();
  await expect(page.getByText("Maria Clara Santos")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cadastrar Paciente" }),
  ).toBeVisible();
});

for (const [role, path] of [
  ["RECEPCIONISTA", "/recepcao"],
  ["MEDICO", "/medico"],
  ["ADMIN", "/admin"],
] as const) {
  test(`login ${role}, perfil do servidor, refresh e logout`, async ({
    page,
  }) => {
    const mock = await api(page, { role });
    await open(page, "/login?area=RECEPCIONISTA");
    await fill(page);
    await page.getByRole("button", { name: "Entrar no sistema" }).click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole("heading", { name: landingHeadings[path] }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: landingHeadings[path] }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.goto(path);
    await expect(page).toHaveURL("/login");
    expect(mock.calls()).toBe(1);
  });
}
test("vazios: validação, foco e zero chamadas", async ({ page }) => {
  const mock = await api(page);
  await open(page);
  await page
    .locator("form")
    .evaluate((form) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await expect(
    page.getByLabel("Matrícula ou E-mail Institucional", { exact: true }),
  ).toBeFocused();
  await expect(page.getByText("Informe seu e-mail.")).toBeVisible();
  await expect(page.getByText("Informe sua senha.")).toBeVisible();
  expect(mock.calls()).toBe(0);
  await page
    .getByLabel("Matrícula ou E-mail Institucional", { exact: true })
    .fill("   ");
  await page
    .locator("form")
    .evaluate((form) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  expect(mock.calls()).toBe(0);
});
for (const [label, status] of [
  ["senha incorreta", 401],
  ["login inexistente", 401],
  ["usuário inativo", 403],
] as const) {
  test(`${label}: mensagem genérica e acesso bloqueado`, async ({ page }) => {
    await api(page, { loginStatus: status });
    await open(page);
    await fill(page);
    await page.getByRole("button", { name: "Entrar no sistema" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "E-mail ou senha inválidos.",
    );
    await expect(page).toHaveURL("/login");
    await expect(
      page.getByLabel("Senha de Acesso", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByLabel("Senha de Acesso", { exact: true }),
    ).toBeFocused();
    await expect(
      page.getByLabel("Matrícula ou E-mail Institucional", { exact: true }),
    ).toHaveValue("operador@clinica.test");
    await expect(page.getByText("Mensagem sensível do servidor.")).toHaveCount(
      0,
    );
  });
}
test("duplo submit é bloqueado e preserva dimensões", async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const mock = await api(page, {
    loginHandler: async (route) => {
      await pending;
      await route.fulfill({ status: 401, json: {} });
    },
  });
  await open(page);
  await fill(page);
  const before = await page
    .getByRole("button", { name: "Entrar no sistema" })
    .boundingBox();
  await page.locator("form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByRole("button", { name: "Entrando…" })).toBeDisabled();
  expect(mock.calls()).toBe(1);
  const after = await page
    .getByRole("button", { name: "Entrando…" })
    .boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.height).toBe(before?.height);
  finish();
  await expect(page.getByRole("alert")).toBeVisible();
});
for (const label of ["API 503", "falha de rede"] as const) {
  test(`${label}: erro distinto e retry`, async ({ page }) => {
    let failure = true;
    await api(page, {
      loginHandler: async (route) => {
        if (failure) {
          if (label === "falha de rede") await route.abort("failed");
          else await route.fulfill({ status: 503, json: {} });
        } else
          await route.fulfill({ json: { user: makeUser("RECEPCIONISTA") } });
      },
    });
    await open(page);
    await fill(page);
    await page.getByRole("button", { name: "Entrar no sistema" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Não foi possível conectar",
    );
    await expect(
      page.getByLabel("Senha de Acesso", { exact: true }),
    ).toHaveValue("senha-de-teste");
    failure = false;
    await page.getByRole("button", { name: "Entrar no sistema" }).click();
    await expect(page).toHaveURL("/recepcao");
  });
}
test("timeout encerra loading e permite retry", async ({ page }) => {
  await api(page, { loginHandler: async () => {} });
  await open(page);
  await fill(page);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível conectar",
    { timeout: 15_000 },
  );
  await expect(
    page.getByRole("button", { name: "Entrar no sistema" }),
  ).toBeEnabled();
});
test("refresh inválido remove conteúdo protegido", async ({ page }) => {
  await api(page);
  await page.goto("/admin");
  await expect(page).toHaveURL("/login");
  await expect(page.getByText("Olá, Pessoa de teste.")).toHaveCount(0);
});
test("expiração ao retornar à aba", async ({ page }) => {
  const mock = await api(page, { authenticated: true });
  await page.goto("/recepcao");
  await expect(
    page.getByRole("button", { name: "Sair", exact: true }),
  ).toBeVisible();
  mock.expire();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page).toHaveURL("/login");
});
test("falha de restauração bloqueia conteúdo e retorna ao login com toast", async ({
  page,
}) => {
  await api(page);
  let failure = true;
  await page.route("**/auth/me", (route) =>
    route.fulfill({ status: failure ? 503 : 401, json: {} }),
  );
  await page.goto("/admin");
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível verificar sua sessão",
  );
  await expect(page).toHaveURL("/login");
  await expect(
    page.getByRole("button", { name: "Tentar novamente" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Matrícula ou E-mail Institucional", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByLabel("Senha de Acesso", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  failure = false;
  await fill(page);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL("/recepcao");
});
test("logout com falha não afirma encerramento", async ({ page }) => {
  await api(page, { authenticated: true, logoutStatus: 503 });
  await page.goto("/recepcao");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível encerrar sua sessão.",
  );
  await expect(page).toHaveURL("/recepcao");
  await expect(
    page.getByRole("button", { name: "Sair", exact: true }),
  ).toBeEnabled();
});
test("perfil sem acesso tem tela própria", async ({ page }) => {
  await api(page, { authenticated: true, role: "MEDICO" });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", {
      name: "Esta área não está disponível para seu perfil.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ir para minha área" }).click();
  await expect(page).toHaveURL("/medico");
});
test("perfil desconhecido falha fechado", async ({ page }) => {
  await api(page, {
    loginHandler: (route) =>
      route.fulfill({
        json: { user: { ...makeUser("ADMIN"), role: "SUPERADMIN" } },
      }),
  });
  await open(page);
  await fill(page);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível verificar seu acesso",
  );
  await expect(page).toHaveURL("/login");
});
test("429 tem feedback próprio", async ({ page }) => {
  await api(page, { loginStatus: 429 });
  await open(page);
  await fill(page);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page.getByRole("alert")).toContainText("Muitas tentativas");
});
test("reveal, teclado, labels e senha ausente de logs/storage", async ({
  page,
}) => {
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  const mock = await api(page);
  await open(page);
  await page
    .getByText("Matrícula ou E-mail Institucional", { exact: true })
    .click();
  await expect(
    page.getByLabel("Matrícula ou E-mail Institucional", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel("Matrícula ou E-mail Institucional", { exact: true }),
  ).toHaveAttribute("autocomplete", "username");
  await expect(
    page.getByLabel("Senha de Acesso", { exact: true }),
  ).toHaveAttribute("autocomplete", "current-password");
  await fill(page);
  await page.getByRole("button", { name: "Mostrar senha" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Senha de Acesso", { exact: true }),
  ).toHaveAttribute("type", "text");
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Senha de Acesso", { exact: true }),
  ).toHaveAttribute("type", "password");
  await page.getByLabel("Senha de Acesso", { exact: true }).press("Enter");
  await expect(page).toHaveURL("/recepcao");
  expect(mock.calls()).toBe(1);
  expect(logs.join("\n")).not.toContain("senha-de-teste");
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain("senha-de-teste");
  expect(page.url()).not.toContain("senha-de-teste");
});
for (const area of ["RECEPCIONISTA", "MEDICO", "ADMIN"] as const) {
  test(`a11y, responsividade e motion: ${area}`, async ({ page }) => {
    await api(page);
    await open(page, `/login?area=${area}`);
    await expect(page.getByText("Área de acesso", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator(".area-picker")).toHaveCount(0);
    await expect(page).toHaveTitle("Login | Agora Você");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    for (const width of [320, 390, 768, 1024, 1504]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole("button", { name: "Entrar no sistema" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".primary-button")
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    ).toBe("0s");
  });
}
test("404 oferece retorno", async ({ page }) => {
  await api(page);
  await page.goto("/rota-inexistente");
  await expect(
    page.getByRole("heading", { name: "Página não encontrada." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Voltar para o login" }).click();
  await expect(page).toHaveURL("/login");
});
test("screenshots do login único e mobile", async ({ page }) => {
  await api(page);
  await open(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "../qa/login-email-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.screenshot({
    path: "../qa/login-email-mobile.png",
    fullPage: true,
  });
});

test("contrato HTTP envia somente credenciais no body", async ({ page }) => {
  let body: unknown;
  let method = "";
  await api(page, {
    loginHandler: async (route) => {
      method = route.request().method();
      body = route.request().postDataJSON();
      await route.fulfill({ json: { user: makeUser("MEDICO") } });
    },
  });
  await open(page, "/login?area=ADMIN");
  await page
    .getByLabel("Matrícula ou E-mail Institucional", { exact: true })
    .fill(" operador@clinica.test ");
  await page
    .getByLabel("Senha de Acesso", { exact: true })
    .fill(" senha-de-teste ");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL("/medico");
  expect(method).toBe("POST");
  expect(body).toEqual({
    login: "operador@clinica.test",
    password: " senha-de-teste ",
  });
});

test("sessão pendente permite digitar e login substitui restauração", async ({
  page,
}) => {
  const mock = await api(page, { role: "MEDICO" });
  await page.route("**/auth/me", async () => {});
  await page.goto("/login?area=ADMIN");
  await expect(
    page.getByText("Verificando sua sessão… Você já pode entrar."),
  ).toBeVisible();
  await expect(
    page.getByLabel("Matrícula ou E-mail Institucional", { exact: true }),
  ).toBeEditable();
  await expect(
    page.getByLabel("Senha de Acesso", { exact: true }),
  ).toBeEditable();
  await fill(page);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL("/medico");
  expect(mock.calls()).toBe(1);
});

test("e-mail inválido é rejeitado localmente", async ({ page }) => {
  const mock = await api(page);
  await open(page);
  await page
    .getByLabel("Matrícula ou E-mail Institucional", { exact: true })
    .fill("email-invalido");
  await page
    .getByLabel("Senha de Acesso", { exact: true })
    .fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
  await expect(
    page.getByLabel("Matrícula ou E-mail Institucional", { exact: true }),
  ).toBeFocused();
  expect(mock.calls()).toBe(0);
});

test("falha de restauração mantém campos e login utilizáveis", async ({
  page,
}) => {
  const mock = await api(page);
  await page.route("**/auth/me", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/login");
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível verificar sua sessão.",
  );
  await fill(page);
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(
    page.getByLabel("Senha de Acesso", { exact: true }),
  ).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL("/recepcao");
  expect(mock.calls()).toBe(1);
});

test("login inválido durante restauração pendente permite nova tentativa", async ({
  page,
}) => {
  const mock = await api(page, { loginStatus: 401 });
  await page.route("**/auth/me", async () => {});
  await page.goto("/login");
  await fill(page);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "E-mail ou senha inválidos.",
  );
  await expect(
    page.getByLabel("Matrícula ou E-mail Institucional", { exact: true }),
  ).toBeEditable();
  await expect(
    page.getByLabel("Senha de Acesso", { exact: true }),
  ).toBeEditable();
  await expect(
    page.getByRole("button", { name: "Entrar no sistema" }),
  ).toBeDisabled();
  expect(mock.calls()).toBe(1);
});

for (const role of ["RECEPCIONISTA", "MEDICO", "ADMIN"] as const) {
  for (const [targetRole, path] of [
    ["RECEPCIONISTA", "/recepcao"],
    ["MEDICO", "/medico"],
    ["ADMIN", "/admin"],
  ] as const) {
    test(`permissão ${role} -> ${targetRole}`, async ({ page }) => {
      await api(page, { authenticated: true, role });
      await page.goto(path);
      if (role === "ADMIN" && targetRole === "RECEPCIONISTA") {
        await expect(
          page.getByRole("heading", {
            name: "Fila de Espera e Gestão de Prioridades",
          }),
        ).toBeVisible();
      } else if (role === targetRole) {
        await expect(
          page.getByRole("heading", { name: landingHeadings[path] }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("heading", {
            name: "Esta área não está disponível para seu perfil.",
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: landingHeadings[path] }),
        ).toHaveCount(0);
      }
    });
  }
}

test("logout 403 não é confundido com sessão revogada", async ({ page }) => {
  await api(page, { authenticated: true, logoutStatus: 403 });
  await page.goto("/recepcao");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "O serviço não confirmou o encerramento",
  );
  await expect(page).toHaveURL("/recepcao");
});

test("logout 401 limpa sessão já inválida", async ({ page }) => {
  await api(page, { authenticated: true, logoutStatus: 401 });
  await page.goto("/recepcao");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL("/login");
});

test("erro de login tem a11y básica e destino autenticado abre a recepção", async ({
  page,
}) => {
  await api(page, { loginStatus: 401 });
  await open(page);
  await fill(page);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.unroute("**/auth/me");
  await api(page, { authenticated: true });
  await page.goto("/recepcao");
  await expect(
    page.getByRole("heading", {
      name: landingHeadings["/recepcao"],
    }),
  ).toBeVisible();
});

test("Entrar fica desabilitado se qualquer campo estiver vazio, inclusive ao apagar", async ({
  page,
}) => {
  const mock = await api(page);
  await open(page);
  const submit = page.getByRole("button", { name: "Entrar no sistema" });
  const email = page.getByLabel("Matrícula ou E-mail Institucional", {
    exact: true,
  });
  const password = page.getByLabel("Senha de Acesso", { exact: true });
  await email.fill("operador@clinica.test");
  await expect(submit).toBeDisabled();
  await password.fill("senha-de-teste");
  await expect(submit).toBeEnabled();
  await email.fill("   ");
  await expect(submit).toBeDisabled();
  await email.fill("operador@clinica.test");
  await password.fill("");
  await expect(submit).toBeDisabled();
  await password.press("Enter");
  expect(mock.calls()).toBe(0);
  await expect(email).toHaveAttribute("aria-invalid", "false");
});

test("credenciais inválidas: um toast, ambos vermelhos, sem retry e correção por campo", async ({
  page,
}) => {
  await api(page, { loginStatus: 401 });
  await open(page);
  await fill(page);
  const submit = page.getByRole("button", { name: "Entrar no sistema" });
  const before = await submit.boundingBox();
  await submit.click();
  await expect(page.getByRole("alert")).toContainText(
    "E-mail ou senha inválidos.",
  );
  const email = page.getByLabel("Matrícula ou E-mail Institucional", {
    exact: true,
  });
  const password = page.getByLabel("Senha de Acesso", { exact: true });
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("button", { name: "Tentar novamente" }),
  ).toHaveCount(0);
  await expect(page.locator("form .feedback")).toHaveCount(0);
  await expect(submit).toBeDisabled();
  const after = await submit.boundingBox();
  expect(after?.x).toBe(before?.x);
  expect(after?.y).toBe(before?.y);
  await page.getByRole("button", { name: "Fechar aviso" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute(
    "aria-describedby",
    /login-auth-error/,
  );
  await password.fill("nova tentativa");
  await expect(password).toHaveAttribute("aria-invalid", "false");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await email.fill("outro@clinica.test");
  await expect(email).toHaveAttribute("aria-invalid", "false");
  await submit.click();
  await expect(page.getByRole("alert")).toHaveCount(1);
});

for (const width of [320, 390, 1504]) {
  test(`toast de sessão: ${width}px, vermelho, acessível e sem cobrir campos`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await api(page);
    await page.route("**/auth/me", (route) => route.fulfill({ status: 503 }));
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/login");
    await expect(page).toHaveTitle("Login | Agora Você");
    await expect(page.getByRole("alert")).toContainText(
      "Não foi possível verificar sua sessão.",
    );
    await expect(
      page.getByRole("button", { name: "Entrar no sistema" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Tentar novamente" }),
    ).toHaveCount(0);
    const toast = await page.locator(".error-toast").boundingBox();
    const email = await page
      .getByLabel("Matrícula ou E-mail Institucional", { exact: true })
      .boundingBox();
    expect(toast).not.toBeNull();
    expect(toast!.x).toBeGreaterThanOrEqual(0);
    expect(toast!.x + toast!.width).toBeLessThanOrEqual(width);
    expect(toast!.y + toast!.height).toBeLessThan(email!.y);
    await expect(
      page.getByLabel("Matrícula ou E-mail Institucional", { exact: true }),
    ).toHaveCSS("border-color", "rgb(165, 45, 56)");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".toast-dismiss")
        .evaluate((button) => getComputedStyle(button).transitionDuration),
    ).toBe("0s");
    await page.screenshot({
      path: `../qa/login-toast-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

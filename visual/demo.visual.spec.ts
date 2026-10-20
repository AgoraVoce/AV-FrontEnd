import { expect, test } from "@playwright/test";
import { captureScreen, trackPageErrors } from "./capture";

// Every available route in the isolated legacy/design-preview mode.
// These screens use seeded, fictional data; the tests never contact a production API.
const screens = [
  { id: "login", path: "/login" },
  { id: "recuperacao", path: "/recuperar-senha" },
  { id: "recepcao-fila", path: "/recepcao?dev=recepcionista" },
  { id: "recepcao-usuarios", path: "/recepcao/usuarios?dev=recepcionista" },
  { id: "novo-cadastro", path: "/novo-cadastro?dev=recepcionista" },
  { id: "consultorio-medico", path: "/medico?dev=medico" },
  { id: "admin-visao-geral", path: "/admin?dev=admin" },
  { id: "admin-usuarios", path: "/admin/usuarios?dev=admin" },
  { id: "admin-fila", path: "/admin/fila?dev=admin" },
  { id: "admin-relatorios", path: "/admin/relatorios?dev=admin" },
  { id: "transmissao", path: "/transmissao" },
  { id: "tv-publica", path: "/transmissao/tv" },
  { id: "pagina-nao-encontrada", path: "/pagina-inexistente" },
] as const;

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: {} }));
  await page.clock.setFixedTime(new Date("2026-10-19T15:30:00-03:00"));
});

for (const screen of screens) {
  test("demonstração / " + screen.id, async ({ page }, info) => {
    const errors = trackPageErrors(page);
    await page.goto(screen.path);
    await expect(page.locator("h1:visible, h2:visible").first()).toBeVisible();
    await captureScreen(page, info, "demo", screen.id, errors);
  });
}

test("demonstração / modal de finalização médica", async ({ page }, info) => {
  const errors = trackPageErrors(page);
  await page.goto("/medico?dev=medico");
  await page.getByRole("button", { name: "Finalizar Atendimento" }).click();
  await expect(page.getByRole("dialog", { name: "Finalização do atendimento" })).toBeVisible();
  await captureScreen(page, info, "demo", "medico-modal-finalizacao", errors);
});

test("demonstração / TV Full HD", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "A captura Full HD usa o projeto desktop.");
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/transmissao/tv");
  await expect(page.getByRole("heading", { name: /CHAMANDO AGORA|NENHUMA CHAMADA ATIVA/ })).toBeVisible();
  await captureScreen(page, info, "demo", "tv-full-hd", errors);
});

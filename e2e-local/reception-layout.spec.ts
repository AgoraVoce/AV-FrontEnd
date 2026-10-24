import { expect, test } from "@playwright/test";

test("recepção mantém polling, busca e paginação nos cinco tamanhos", async ({ page }) => {
  let requests = 0;
  await page.clock.install();
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/login")) return route.fulfill({ json: { accessToken: "layout-test", tokenType: "Bearer", expiresIn: 900, user: { id: "layout-user", name: "Recepção Teste", email: "layout@test.test", role: "RECEPCIONISTA" } } });
    if (path.endsWith("/queues/waiting")) {
      requests++;
      return route.fulfill({ json: { items: Array.from({ length: 8 }, (_, index) => ({ entryId: String(index), fullName: `Pessoa ${index}`, queueCode: `FRONT-${index}` })) } });
    }
    return route.fulfill({ status: 200, json: {} });
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("layout@test.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-teste");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page.getByRole("heading", { name: "Fila de Espera e Gestão de Prioridades" })).toBeVisible();
  for (const width of [1920, 1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("cell", { name: "Pessoa 0", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/reception-${width}.png`, fullPage: true, animations: "disabled" });
  }
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("button", { name: "Fechar menu" })).toBeVisible();
  await page.getByRole("button", { name: "Fechar menu" }).click();
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.getByRole("button", { name: "Próxima ›" }).click();
  await expect(page.getByRole("cell", { name: "Pessoa 7", exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("Pessoa 2");
  await expect(page.getByRole("cell", { name: "Pessoa 2", exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const before = requests;
  await page.clock.fastForward(30_000);
  await expect.poll(() => requests).toBeGreaterThan(before);
});

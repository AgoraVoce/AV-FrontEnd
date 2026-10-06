import { expect, test } from "@playwright/test";

const devReceptionUrl = "/recepcao?dev=RECEPCIONISTA";

async function openDelete(page: import("@playwright/test").Page, name: string) {
  const row = page.locator("tr").filter({ hasText: name });
  await row.getByRole("button", { name: `Excluir paciente ${name}` }).click();
  return { row, dialog: page.getByRole("alertdialog", { name: "Excluir paciente da fila?" }) };
}

test("destaque de exclusão segue a gravidade atual", async ({ page }) => {
  await page.goto(devReceptionUrl);
  for (const [name, severity, expectedColor, expectedButton, expectedText] of [
    ["Maria Clara Santos", "urgent", "#c73c3d", "rgb(179, 52, 56)", "rgb(255, 255, 255)"],
    ["Ana Beatriz Rocha", "alert", "#c18a14", "rgb(154, 106, 8)", "rgb(63, 43, 5)"],
    ["Juliana Mendes", "calm", "#1f8d5a", "rgb(35, 116, 68)", "rgb(255, 255, 255)"],
  ] as const) {
    const { row, dialog } = await openDelete(page, name);
    await expect(row).toHaveClass(new RegExp(`is-reassessing ${severity}`));
    expect(await row.evaluate((element) => getComputedStyle(element).getPropertyValue("--nivel-borda").trim())).toBe(expectedColor);
    const editingButton = row.getByRole("button", { name: "Alterando..." });
    await expect(editingButton).toBeVisible();
    expect(await editingButton.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(expectedButton);
    expect(await editingButton.evaluate((element) => getComputedStyle(element).color)).toBe(expectedText);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).not.toHaveClass(/is-reassessing/);
  }
});

test("exclusão exige motivo, sai da fila e TV, desfaz mantendo senha e espera", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const reception = await context.newPage();
  const tv = await context.newPage();
  await Promise.all([
    reception.goto(devReceptionUrl),
    tv.goto("/transmissao"),
  ]);
  const originalRow = reception.locator("tr").filter({ hasText: "Ana Beatriz Rocha" });
  const originalTicket = await originalRow.locator(".ticket-cell").innerText();
  const originalWait = await originalRow.locator(".wait-cell").innerText();
  const { dialog } = await openDelete(reception, "Ana Beatriz Rocha");
  await expect(dialog.getByRole("button", { name: "Excluir paciente" })).toBeDisabled();
  await expect(dialog.getByText("Selecione o motivo da exclusão")).toBeVisible();
  await dialog.getByLabel("Motivo da exclusão").selectOption("Cadastro duplicado");
  await expect(dialog.getByRole("button", { name: "Excluir paciente" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Excluir paciente" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(reception.locator("tbody tr").filter({ hasText: "Ana Beatriz Rocha" })).toHaveCount(0);
  await expect(reception.locator(".mini-stat.alert")).toContainText("4 Alertas");
  await expect(reception.locator(".total-main-line strong")).toHaveText("15");
  await expect(reception.locator(".reception-page")).toHaveAttribute("data-audit-count", "1");
  await expect(tv.locator(".proximo-card").filter({ hasText: "A-051" })).toHaveCount(0);
  const toast = reception.locator(".reevaluation-notifications");
  await expect(toast).toContainText("Ana Beatriz Rocha removido da fila");
  await toast.getByRole("button", { name: "Desfazer" }).click();
  const restoredRow = reception.locator("tr").filter({ hasText: "Ana Beatriz Rocha" });
  await expect(restoredRow).toHaveCount(1);
  await expect.poll(async () => (await restoredRow.locator(".ticket-cell").innerText()).replace(/\s+/g, "")).toBe(originalTicket.replace(/\s+/g, ""));
  await expect.poll(async () => (await restoredRow.locator(".wait-cell").innerText()).replace(/\s+/g, "")).toBe(originalWait.replace(/\s+/g, ""));
  await expect(tv.locator(".proximo-card").filter({ hasText: "A-051" })).toHaveCount(1);
  await expect(reception.locator(".mini-stat.alert")).toContainText("5 Alertas");
  await expect(reception.locator(".reception-page")).toHaveAttribute("data-audit-count", "2");
  await context.close();
});

test("exclui e desfaz pacientes dos três níveis de gravidade", async ({ page }) => {
  await page.goto(devReceptionUrl);
  for (const name of ["Maria Clara Santos", "Ana Beatriz Rocha", "Juliana Mendes"]) {
    const { dialog } = await openDelete(page, name);
    await dialog.getByLabel("Motivo da exclusão").selectOption("Paciente desistiu / evadiu");
    await dialog.getByRole("button", { name: "Excluir paciente" }).click();
    await expect(page.locator("tr").filter({ hasText: name })).toHaveCount(0);
    const toast = page.locator(".reevaluation-notifications");
    await expect(toast).toContainText(`${name} removido da fila`);
    await toast.getByRole("button", { name: "Desfazer" }).click();
    await expect(page.locator("tr").filter({ hasText: name })).toHaveCount(1);
  }
});

test("Outro exige descrição de dez caracteres e ESC/X não excluem", async ({ page }) => {
  await page.goto(devReceptionUrl);
  const { row, dialog } = await openDelete(page, "Jorge Fernando Alves");
  await dialog.getByLabel("Motivo da exclusão").selectOption("Outro");
  await expect(dialog.getByRole("button", { name: "Excluir paciente" })).toBeDisabled();
  const description = dialog.getByLabel("Descreva o motivo");
  await description.fill("curto");
  await expect(dialog.getByRole("button", { name: "Excluir paciente" })).toBeDisabled();
  await description.fill("Registro criado por engano no atendimento.");
  await expect(dialog.getByRole("button", { name: "Excluir paciente" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(row).toHaveCount(1);

  const reopened = await openDelete(page, "Jorge Fernando Alves");
  await reopened.dialog.getByRole("button", { name: "Fechar modal" }).click();
  await expect(reopened.dialog).toHaveCount(0);
  await expect(reopened.row).toHaveCount(1);
});

test("perfil médico não vê a lixeira", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({
    json: { user: { id: "medico-1", name: "Dra. Teste", login: "medico@test", role: "MEDICO" } },
  }));
  await page.goto("/recepcao");
  await expect(page.getByRole("heading", { name: "Esta área não está disponível para seu perfil." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Excluir paciente/ })).toHaveCount(0);
});

test("perfil admin acessa a fila e vê a lixeira", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({
    json: { user: { id: "admin-1", name: "Admin Teste", login: "admin@test", role: "ADMIN" } },
  }));
  await page.goto("/recepcao");
  await expect(page.getByRole("heading", { name: "Fila de Espera e Gestão de Prioridades" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Excluir paciente Ana Beatriz Rocha" })).toBeVisible();
});
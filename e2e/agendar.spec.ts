import { expect, test } from "@playwright/test";

test("cliente agenda um Corte e vê a tela Pronto", async ({ page }) => {
  await page.goto("/");

  // 1. Serviço
  await page.locator("[role=checkbox]", { has: page.getByText("Corte", { exact: true }) }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // 2. Barbeiro, primeiro dia habilitado e primeiro horário
  await page.locator("h2:has-text('Escolha o barbeiro') + div button").first().click();
  await page.locator("button[aria-label^='20']:not([disabled])").first().click();
  const horario = page.locator("button[aria-pressed]").filter({ hasText: /^\d\d:\d\d$/ }).first();
  await expect(horario).toBeVisible();
  await horario.click();

  // 3. Dados, aceite e Turnstile (a chave de teste aprova sozinha)
  await page.getByLabel("Seu nome").fill("João Teste");
  await page.getByLabel("Celular (WhatsApp)").fill("48999991234");
  await page.getByRole("checkbox", { name: /Aceito receber mensagens/ }).check();
  await expect(page.locator("input[name='cf-turnstile-response']")).not.toHaveValue("", { timeout: 30_000 });
  await page.getByRole("button", { name: "Confirmar horário" }).click();

  await expect(page.getByText("Pronto, tá marcado!")).toBeVisible();
});

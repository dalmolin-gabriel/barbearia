import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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

// O dono entra com E2E_USUARIO / E2E_SENHA (o usuário criado no banco de teste).
test("dono vê o agendamento em Hoje e marca Chegou", async ({ page }) => {
  await page.goto("/painel/entrar");
  await page.getByLabel("Usuário").fill(process.env.E2E_USUARIO ?? "padilha");
  await page.getByLabel("Senha").fill(process.env.E2E_SENHA ?? "senha-de-teste-123");
  await page.getByRole("button", { name: "Entrar" }).click();

  // O teste anterior marcou no primeiro dia habilitado (hoje); se não achar, olha amanhã.
  await page.getByRole("button", { name: "Todos" }).click();
  const cliente = page.getByText("João Teste").first();
  await page.waitForTimeout(500);
  if (!(await cliente.isVisible())) await page.getByRole("button", { name: /Amanhã/ }).click();
  await expect(cliente).toBeVisible();

  await page.getByRole("button", { name: "✓ Chegou" }).click();
  await expect(page.getByText("✓ JÁ ATENDIDOS")).toBeVisible();
  await expect(page.getByText("João Teste")).toBeVisible();
});

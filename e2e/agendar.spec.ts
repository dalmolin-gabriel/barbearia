import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const CODIGO = "codigo-de-instalacao-do-e2e";
const USUARIO = "padilha";
const SENHA = "senha-de-teste-123";

// O script do Turnstile vem de challenges.cloudflare.com, que pode estar bloqueado na rede de
// teste. Troca por um stub que chama o callback com um token qualquer; a chave secreta de teste
// da Cloudflare aprova qualquer token.
async function stubTurnstile(page: Page) {
  await page.route("**/turnstile/v0/api.js*", (rota) =>
    rota.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = {
        render: (el, o) => { el.textContent = "stub"; setTimeout(() => o.callback("token-e2e"), 50); return "w1"; },
        reset: () => {}, remove: () => {},
      };`,
    }),
  );
}

let diaMarcado = "";

test("primeiro acesso cria o dono com o código de instalação", async ({ page }) => {
  await page.goto("/painel/entrar");
  await page.getByRole("link", { name: /Primeiro acesso\? Criar conta do dono/ }).click();
  await expect(page).toHaveURL(/\/painel\/primeiro-acesso/);

  await page.getByLabel("Código de instalação").fill("codigo-errado-123");
  await page.getByLabel("Seu nome").fill("Padilha");
  await page.getByLabel("Usuário").fill(USUARIO);
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByRole("button", { name: "mostrar" }).click();
  await expect(page.getByLabel(/^Senha/)).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("alert")).toContainText("Código de instalação incorreto.");

  await page.getByLabel("Código de instalação").fill(CODIGO);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.getByRole("navigation", { name: "Menu do painel" })).toBeVisible();

  // Depois de criada, a tela deixa de oferecer o cadastro.
  await page.goto("/painel/primeiro-acesso");
  await expect(page.getByText("O sistema já foi configurado.")).toBeVisible();
});

test("cliente agenda um Corte e vê a tela Pronto", async ({ page }) => {
  await stubTurnstile(page);
  await page.goto("/");

  // 1. Serviço (os de exemplo vêm do primeiro acesso)
  await page.locator("[role=checkbox]", { has: page.getByText("Corte", { exact: true }) }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // 2. Barbeiro; primeiro dia habilitado que tenha horário livre
  await page.locator("h2:has-text('Escolha o barbeiro') + div button").first().click();
  const dias = page.locator("button[aria-label^='20']:not([disabled])");
  const horario = page.locator("button[aria-pressed]").filter({ hasText: /^\d\d:\d\d$/ }).first();
  const total = await dias.count();
  let achou = false;
  for (let i = 0; i < total && !achou; i++) {
    const dia = dias.nth(i);
    diaMarcado = (await dia.getAttribute("aria-label")) ?? "";
    await dia.click();
    await horario.or(page.getByText("Sem horários livres neste dia.")).first().waitFor();
    achou = (await horario.count()) > 0;
  }
  expect(achou, "algum dia habilitado deveria ter horário livre").toBe(true);
  await horario.click();

  // 3. Dados, aceite e Turnstile
  await page.getByLabel("Seu nome").fill("João Teste");
  await page.getByLabel("Celular (WhatsApp)").fill("48999991234");
  await page.getByRole("checkbox", { name: /Aceito receber mensagens/ }).check();
  await expect(page.getByText("stub")).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Confirmar horário" }).click();

  await expect(page.getByText("Pronto, tá marcado!")).toBeVisible();
});

test("dono vê o agendamento em Hoje e marca Chegou", async ({ page }) => {
  await page.goto("/painel/entrar");
  await page.getByLabel("Usuário").fill(USUARIO);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel$/);

  // Vai para o dia marcado pelo teste anterior (se não for hoje).
  if (!(await page.getByRole("heading", { name: /^Hoje/ }).isVisible()) || !(await page.getByText("João Teste").first().isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Escolher data/ }).click();
    const alvo = page.locator(`button[aria-label='${diaMarcado}']`);
    if (!(await alvo.isVisible())) await page.getByRole("button", { name: "Próximo mês" }).click();
    await alvo.click();
  }
  await expect(page.getByText("João Teste").first()).toBeVisible();

  await page.getByRole("button", { name: "✓ Chegou" }).click();
  await expect(page.getByText("✓ JÁ ATENDIDOS")).toBeVisible();
  await expect(page.getByText("João Teste")).toBeVisible();
});

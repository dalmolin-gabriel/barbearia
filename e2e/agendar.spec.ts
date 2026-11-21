import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const EMAIL = "padilha@exemplo.com";
const SENHA = "senha-de-teste-123";
const SENHA_NOVA = "senha-nova-456";

// Código de recuperação mostrado uma vez no cadastro (capturado no primeiro teste).
let codigoRecuperacao = "";

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

test("cadastro aberto cria o dono e depois fecha", async ({ page }) => {
  await page.goto("/painel/entrar");
  await page.getByRole("link", { name: "Não tem conta? Cadastre-se" }).click();
  await expect(page).toHaveURL(/\/painel\/cadastro/);
  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();

  await page.getByLabel("E-mail").fill("isso-nao-e-email");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByRole("button", { name: "mostrar" }).click();
  await expect(page.getByLabel(/^Senha/)).toHaveAttribute("type", "text");
  // E-mail inválido: o navegador barra o envio e nada é criado.
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/painel\/cadastro/);

  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByRole("button", { name: "Criar conta" }).click();
  // Tela única do código de recuperação: só depois de "Já guardei" entra no painel.
  await expect(page.getByRole("heading", { name: "Guarde este código de recuperação" })).toBeVisible();
  codigoRecuperacao = ((await page.getByTestId("codigo-recuperacao").textContent()) ?? "").trim();
  expect(codigoRecuperacao).toMatch(/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){2}$/);
  await expect(page.getByRole("button", { name: "Copiar" })).toBeVisible();
  await page.getByRole("button", { name: "Já guardei" }).click();
  await expect(page).toHaveURL(/\/painel$/);
  // No celular o menu é uma gaveta: abre pelo botão ☰ e mostra a navegação.
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("navigation", { name: "Menu do painel" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Menu do painel" })).toBeHidden();

  // Depois de criada, o cadastro fecha e o endereço antigo redireciona.
  await page.goto("/painel/primeiro-acesso");
  await expect(page).toHaveURL(/\/painel\/cadastro/);
  await expect(page.getByText("Cadastro fechado. Peça ao dono para criar sua conta.")).toBeVisible();
});

/** Fluxo do cliente até a tela Pronto. `ultimoDia` escolhe o dia mais distante (longe do prazo de 2 h). */
async function agendarCorte(page: Page, nome: string, celular: string, ultimoDia = false) {
  await stubTurnstile(page);
  await page.goto("/");

  // 1. Serviço (os de exemplo vêm do cadastro)
  await page.locator("[role=radio]", { has: page.getByText("Corte", { exact: true }) }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // 2. Barbeiro; primeiro dia habilitado que tenha horário livre
  await page.locator("h2:has-text('Escolha o barbeiro') + div button").first().click();
  const dias = page.locator("button[aria-label^='20']:not([disabled])");
  const horario = page.locator("button[aria-pressed]").filter({ hasText: /^\d\d:\d\d$/ }).first();
  const total = await dias.count();
  let achou = false;
  let marcado = "";
  if (ultimoDia) {
    // Precisa de um horário com pelo menos 2h15 de antecedência (senão o cancelamento não é oferecido).
    // Primeiro dia habilitado: o ÚLTIMO horário livre; se não der, o primeiro horário dos dias seguintes.
    const info = (await (await page.request.get("/api/publico/info")).json()) as { dias: string[] };
    const limite = Date.now() + 135 * 60_000;
    const horarios = page.locator("button[aria-pressed]").filter({ hasText: /^\d\d:\d\d$/ });
    for (let n = 0; n < total && !achou; n++) {
      const dia = dias.nth(n);
      const data = info.dias[n];
      await dia.click();
      await horario.or(page.getByText("Sem horários livres neste dia.")).first().waitFor();
      const qtd = await horarios.count();
      if (qtd === 0 || !data) continue;
      const alvo = n === 0 ? horarios.nth(qtd - 1) : horarios.first();
      const hora = ((await alvo.textContent()) ?? "").trim();
      if (new Date(`${data}T${hora}:00-03:00`).getTime() < limite) continue;
      marcado = (await dia.getAttribute("aria-label")) ?? "";
      await alvo.click();
      achou = true;
    }
    test.skip(!achou, "Sem horário livre com 2h15 de antecedência na janela atual.");
  } else {
    for (let n = 0; n < total && !achou; n++) {
      const dia = dias.nth(n);
      marcado = (await dia.getAttribute("aria-label")) ?? "";
      await dia.click();
      await horario.or(page.getByText("Sem horários livres neste dia.")).first().waitFor();
      achou = (await horario.count()) > 0;
    }
    expect(achou, "algum dia habilitado deveria ter horário livre").toBe(true);
    await horario.click();
  }

  // 3. Dados, aceite e Turnstile
  await page.getByLabel("Seu nome").fill(nome);
  await page.getByLabel("Celular (WhatsApp)").fill(celular);
  await page.getByRole("checkbox", { name: /Aceito receber mensagens/ }).check();
  await expect(page.getByText("stub")).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Confirmar horário" }).click();

  await expect(page.getByText("Pronto, tá marcado!")).toBeVisible();
  return marcado;
}

test("cliente agenda um Corte e vê a tela Pronto", async ({ page }) => {
  diaMarcado = await agendarCorte(page, "João Teste", "48999991234");
});

test("cliente cancela o próprio horário pelo link e o painel não o lista mais", async ({ page }) => {
  const dia = await agendarCorte(page, "Maria Cancela", "48988887777", true);
  await page.getByRole("link", { name: "Ver meu horário" }).click();
  await expect(page).toHaveURL(/\/meu-horario\//);
  await expect(page.getByRole("heading", { name: "Seu horário" })).toBeVisible();
  await expect(page.getByText("Marcado", { exact: true })).toBeVisible();

  // Voltando ao início, o horário aparece em "Seus horários".
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Seus horários" })).toBeVisible();
  await page.getByRole("link", { name: /Corte/ }).click();

  await page.getByRole("button", { name: "Cancelar horário" }).click();
  await expect(page.getByText("Tem certeza? O horário fica livre para outra pessoa.")).toBeVisible();
  await page.getByRole("button", { name: "Sim, cancelar" }).click();
  await expect(page.getByText("Horário cancelado. Quando quiser, é só marcar de novo.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Marcar outro horário" })).toBeVisible();

  // Recarregando o link, o horário consta como cancelado e o card some da home.
  await page.reload();
  await expect(page.getByText("Este horário foi cancelado.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Seus horários" })).toHaveCount(0);

  // Painel: o dono não vê mais a Maria na agenda do dia.
  await page.goto("/painel/entrar");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.getByRole("button", { name: /Escolher data/ }).click();
  const alvo = page.locator(`button[aria-label='${dia}']`);
  if (!(await alvo.isVisible())) await page.getByRole("button", { name: "Próximo mês" }).click();
  await alvo.click();
  // Pode ser o próprio dia que o painel já mostra (sem nova requisição): consulta a agenda direto.
  const agenda = (await (await page.request.get(`/api/agenda?data=${dia}`)).json()) as { atendimentos: { cliente_nome: string; status: string }[] };
  expect(agenda.atendimentos.find((x) => x.cliente_nome === "Maria Cancela")?.status).toBe("cancelado");
  // Se só há um dia habilitado, o João (outro teste) divide o dia com a Maria: aí o total não zera.
  if (dia !== diaMarcado) await expect(page.getByText("0 clientes · 0 atendidos")).toBeVisible();
  await expect(page.getByText("Maria Cancela")).toHaveCount(0);
});

test("dono vê o agendamento em Hoje e só marca Chegou no dia do atendimento", async ({ page }) => {
  await page.goto("/painel/entrar");
  await expect(page.getByRole("link", { name: "Não tem conta? Cadastre-se" })).toHaveCount(0);
  await page.getByLabel("E-mail").fill(EMAIL);
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

  // Dia do atendimento no futuro (Brasília): sem "Chegou"/"Faltou", só o aviso; o resto das ações segue.
  const hoje = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()),
  );
  if (diaMarcado > hoje) {
    const nota = "“Chegou” fica disponível no dia do atendimento.";
    await expect(page.getByText(nota)).toBeVisible();
    await expect(page.getByRole("button", { name: "✓ Chegou" })).toHaveCount(0);
    await page.getByRole("button", { name: /João Teste/ }).first().click();
    await expect(page.getByRole("button", { name: "Cliente confirmou" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remarcar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Faltou" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Chegou/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // O servidor também recusa; um atendimento de hoje, à noite, aceita "Chegou".
    const ids = await page.evaluate(async (dia) => {
      const post = (url: string, corpo: unknown, metodo = "POST") =>
        fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const servicos = (await (await fetch("/api/servicos")).json()) as { id: string }[] | { servicos: { id: string }[] };
      const lista = Array.isArray(servicos) ? servicos : servicos.servicos;
      const agenda = (await (await fetch(`/api/agenda?data=${dia}`)).json()) as { atendimentos: { id: string; cliente_nome: string }[] };
      const futuro = agenda.atendimentos.find((a) => a.cliente_nome === "João Teste")!;
      const recusa = await post(`/api/atendimentos/${futuro.id}/situacao`, { situacao: "atendido" }, "PATCH");
      return { recusa: recusa.status, servico: lista[0]!.id };
    }, diaMarcado);
    expect(ids.recusa).toBe(400);
    const criado = await page.evaluate(
      async ({ servico, dia }) =>
        (
          await fetch("/api/atendimentos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome: "Cliente Hoje", servicos: [servico], data: dia, hora: "23:30", confirmarAvisos: true }),
          })
        ).status,
      { servico: ids.servico, dia: hoje },
    );
    expect(criado).toBe(201);
    await page.getByRole("button", { name: "Hoje", exact: true }).click();
    await expect(page.getByText("Cliente Hoje").first()).toBeVisible();
  }

  await page.getByRole("button", { name: "✓ Chegou" }).click();
  await expect(page.getByText("✓ JÁ ATENDIDOS")).toBeVisible();
  await expect(page.getByText(diaMarcado > hoje ? "Cliente Hoje" : "João Teste")).toBeVisible();
});

test("dono esquece a senha e redefine com o código de recuperação", async ({ page }) => {
  await page.goto("/painel/entrar");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.waitForLoadState("networkidle");
  await page.request.post("/api/auth/sair", { headers: { Origin: new URL(page.url()).origin } });

  await page.goto("/painel/entrar");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL(/\/painel\/esqueci-senha/);
  await expect(page.getByText("É barbeiro? Peça ao dono para criar uma nova senha para você em Equipe.")).toBeVisible();

  // Código errado: mensagem genérica.
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Código de recuperação").fill("ABCD-EFGH-JKMN");
  await page.getByLabel(/^Nova senha/).fill(SENHA_NOVA);
  await page.getByLabel("Confirmar nova senha").fill(SENHA_NOVA);
  await page.getByRole("button", { name: "Alterar senha" }).click();
  await expect(page.getByRole("alert")).toContainText("E-mail ou código de recuperação incorretos.");

  await page.getByLabel("Código de recuperação").fill(codigoRecuperacao.toLowerCase());
  await page.getByRole("button", { name: "mostrar" }).click();
  await page.getByRole("button", { name: "Alterar senha" }).click();
  await expect(page).toHaveURL(/\/painel\/entrar/);
  await expect(page.getByText("Senha alterada! Entre com a nova senha.")).toBeVisible();

  // A senha antiga não entra mais; a nova, sim.
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toContainText("E-mail ou senha incorretos.");
  await page.getByLabel("Senha").fill(SENHA_NOVA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel$/);

  // O código é de uso único: em Equipe consta "não criado" e dá para gerar outro.
  await page.goto("/painel/equipe");
  await expect(page.getByText(/Código de recuperação: não criado/)).toBeVisible();
  await page.getByLabel("Confirme com a sua senha").fill(SENHA_NOVA);
  await page.getByRole("button", { name: "Gerar novo código de recuperação" }).click();
  await expect(page.getByRole("heading", { name: "Guarde este código de recuperação" })).toBeVisible();
  await expect(page.getByTestId("codigo-recuperacao")).not.toHaveText(codigoRecuperacao);
  await page.getByRole("button", { name: "Já guardei" }).click();
  await expect(page.getByText(/Código de recuperação: criado em \d\d\/\d\d\/\d{4}/)).toBeVisible();
});

test("dono zera o sistema e o Cadastre-se volta", async ({ page }) => {
  await page.goto("/painel/entrar");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA_NOVA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel$/);

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("navigation", { name: "Menu do painel" }).getByRole("link", { name: /Equipe/ }).click();
  await expect(page.getByText(EMAIL).locator("visible=true")).toBeVisible();
  const zerar = page.getByRole("button", { name: "Zerar sistema" });
  await expect(page.getByText("Zerar sistema e entregar para o dono")).toBeVisible();
  await expect(zerar).toBeDisabled();

  // Senha errada: o servidor recusa e nada some.
  await page.getByLabel("Sua senha atual").fill("senha-errada-123");
  await page.getByLabel("Digite ZERAR para confirmar").fill("ZERAR");
  await zerar.click();
  await expect(page.getByRole("alert")).toContainText("Senha incorreta.");
  await expect(page).toHaveURL(/\/painel\/equipe/);

  await page.getByLabel("Sua senha atual").fill(SENHA_NOVA);
  await zerar.click();
  await expect(page).toHaveURL(/\/painel\/cadastro/);
  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();

  await page.goto("/painel/entrar");
  await expect(page.getByRole("link", { name: "Não tem conta? Cadastre-se" })).toBeVisible();
});

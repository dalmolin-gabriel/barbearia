import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { criarUsuario, req, tokenDoCookie } from "./ajuda";

const TABELAS = ["push_inscricoes", "sessoes", "atendimentos", "bloqueios", "clientes", "expediente", "tentativas_login", "limites", "usuarios", "servicos"];
const FORMATO = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;
const EMAIL = "dono@exemplo.com";
const SENHA = "senha-forte-1";

let proximoIp = 0;
const ip = () => `198.51.100.${++proximoIp}`;

const recuperar = (corpo: unknown, ipDe = ip()) => req("/api/auth/recuperar", { metodo: "POST", corpo, ip: ipDe });
const nova = (codigo: string, extra: Record<string, unknown> = {}) => ({ email: EMAIL, codigo, novaSenha: "outra-senha-9", ...extra });

async function cadastrar() {
  const r = await req("/api/cadastro", { metodo: "POST", corpo: { email: EMAIL, senha: SENHA }, ip: ip() });
  expect(r.status).toBe(201);
  const corpo = (await r.json()) as { codigoRecuperacao: string };
  return { codigo: corpo.codigoRecuperacao, token: tokenDoCookie(r)! };
}

beforeEach(async () => {
  for (const t of TABELAS) await env.DB.prepare(`DELETE FROM ${t}`).run();
});

describe("código de recuperação", () => {
  it("o cadastro devolve o código no formato certo e guarda só o hash", async () => {
    const { codigo } = await cadastrar();
    expect(codigo).toMatch(FORMATO);
    const linha = await env.DB.prepare("SELECT recuperacao_hash, recuperacao_criado_em FROM usuarios").first<{
      recuperacao_hash: string;
      recuperacao_criado_em: string;
    }>();
    expect(linha?.recuperacao_hash).toMatch(/^pbkdf2\$/);
    expect(linha?.recuperacao_hash).not.toContain(codigo.replaceAll("-", ""));
    expect(linha?.recuperacao_criado_em).toBeTruthy();
  });

  it("funciona uma vez (aceita minúsculas e sem traços), troca a senha e a segunda vez dá 400", async () => {
    const { codigo, token } = await cadastrar();
    const r = await recuperar(nova(codigo.toLowerCase().replaceAll("-", " ")));
    expect(r.status).toBe(204);
    // Sessão antiga derrubada.
    expect((await req("/api/auth/eu", { token })).status).toBe(401);
    // Entra com a nova senha; a antiga não vale mais.
    expect((await req("/api/auth/entrar", { metodo: "POST", corpo: { email: EMAIL, senha: "outra-senha-9" }, ip: ip() })).status).toBe(200);
    expect((await req("/api/auth/entrar", { metodo: "POST", corpo: { email: EMAIL, senha: SENHA }, ip: ip() })).status).toBe(401);
    // Uso único.
    const de_novo = await recuperar(nova(codigo, { novaSenha: "mais-uma-senha-1" }));
    expect(de_novo.status).toBe(400);
    expect(await de_novo.json()).toEqual({ erro: "E-mail ou código de recuperação incorretos." });
    const linha = await env.DB.prepare("SELECT recuperacao_hash FROM usuarios").first<{ recuperacao_hash: string | null }>();
    expect(linha?.recuperacao_hash).toBeNull();
  });

  it("limpa o bloqueio de tentativas de login", async () => {
    const { codigo } = await cadastrar();
    await env.DB.prepare("INSERT INTO tentativas_login (usuario, falhas, bloqueado_ate) VALUES (?, 5, ?)")
      .bind(EMAIL, new Date(Date.now() + 600_000).toISOString())
      .run();
    expect((await recuperar(nova(codigo))).status).toBe(204);
    expect(await env.DB.prepare("SELECT 1 FROM tentativas_login WHERE usuario = ?").bind(EMAIL).first()).toBeNull();
  });

  it("código errado, e-mail inexistente e dados inválidos dão o mesmo 400", async () => {
    const { codigo } = await cadastrar();
    for (const corpo of [
      nova("ABCD-EFGH-JKMN"),
      nova(codigo, { email: "ninguem@exemplo.com" }),
      nova(codigo, { novaSenha: "curta" }),
      { lixo: true },
    ]) {
      const r = await recuperar(corpo);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ erro: "E-mail ou código de recuperação incorretos." });
    }
    // O código certo continua valendo depois das falhas.
    expect((await recuperar(nova(codigo))).status).toBe(204);
  });

  it("barbeiro não usa a recuperação, mesmo com um código válido no banco", async () => {
    const { codigo } = await cadastrar();
    const b = await criarUsuario("barbeiro", { usuario: "barbeiro@exemplo.com" });
    const dono = await env.DB.prepare("SELECT recuperacao_hash FROM usuarios WHERE papel = 'dono'").first<{ recuperacao_hash: string }>();
    await env.DB.prepare("UPDATE usuarios SET recuperacao_hash = ? WHERE id = ?").bind(dono!.recuperacao_hash, b.id).run();
    const r = await recuperar(nova(codigo, { email: b.usuario }));
    expect(r.status).toBe(400);
    expect((await req("/api/auth/eu", { token: b.token })).status).toBe(200);
  });

  it("dono inativo não recupera", async () => {
    const { codigo } = await cadastrar();
    await env.DB.prepare("UPDATE usuarios SET ativo = 0").run();
    expect((await recuperar(nova(codigo))).status).toBe(400);
  });

  it("limita por IP (6ª tentativa em 1 h dá 429) e por e-mail (6ª no dia dá 429)", async () => {
    await cadastrar();
    const mesmoIp = "203.0.113.9";
    for (let i = 0; i < 5; i++) expect((await recuperar(nova("ABCD-EFGH-JKMN", { email: `x${i}@exemplo.com` }), mesmoIp)).status).toBe(400);
    expect((await recuperar(nova("ABCD-EFGH-JKMN", { email: "x9@exemplo.com" }), mesmoIp)).status).toBe(429);

    for (let i = 0; i < 5; i++) expect((await recuperar(nova("ABCD-EFGH-JKMN"))).status).toBe(400);
    expect((await recuperar(nova("ABCD-EFGH-JKMN"))).status).toBe(429);
  });

  it("gerar novo código exige a senha certa, invalida o anterior e limita a 5 por 15 min", async () => {
    const { codigo: antigo, token } = await cadastrar();
    const gerar = (senha: string) => req("/api/conta/recuperacao", { metodo: "POST", token, corpo: { senha } });

    const errada = await gerar("senha-errada-1");
    expect(errada.status).toBe(403);
    expect(await errada.json()).toEqual({ erro: "Senha incorreta." });

    const ok = await gerar(SENHA);
    expect(ok.status).toBe(200);
    const { codigoRecuperacao: novo } = (await ok.json()) as { codigoRecuperacao: string };
    expect(novo).toMatch(FORMATO);
    expect(novo).not.toBe(antigo);

    expect((await recuperar(nova(antigo))).status).toBe(400);
    expect((await recuperar(nova(novo))).status).toBe(204);

    // Limite: já foram 2 tentativas; mais 3 passam, a 6ª não.
    const dono = await criarUsuario("dono", { usuario: "outro@exemplo.com" });
    const g = (s: string) => req("/api/conta/recuperacao", { metodo: "POST", token: dono.token, corpo: { senha: s } });
    for (let i = 0; i < 5; i++) expect((await g("errada-errada")).status).toBe(403);
    expect((await g("errada-errada")).status).toBe(429);
  });

  it("só o dono gera; sem login é 401", async () => {
    const b = await criarUsuario("barbeiro");
    expect((await req("/api/conta/recuperacao", { metodo: "POST", token: b.token, corpo: { senha: b.senha } })).status).toBe(403);
    expect((await req("/api/conta/recuperacao", { metodo: "POST", corpo: { senha: "x" } })).status).toBe(401);
  });

  it("nenhuma rota GET devolve o código nem o hash", async () => {
    const { codigo, token } = await cadastrar();
    const hash = (await env.DB.prepare("SELECT recuperacao_hash FROM usuarios").first<{ recuperacao_hash: string }>())!.recuperacao_hash;
    for (const caminho of ["/api/auth/eu", "/api/equipe", "/api/conta/recuperacao", "/api/cadastro"]) {
      const texto = await (await req(caminho, { token })).text();
      expect(texto, caminho).not.toContain(codigo);
      expect(texto, caminho).not.toContain(codigo.replaceAll("-", ""));
      expect(texto, caminho).not.toContain(hash);
      expect(texto, caminho).not.toContain("recuperacao_hash");
    }
    const info = (await (await req("/api/conta/recuperacao", { token })).json()) as { criadoEm: string | null };
    expect(info.criadoEm).toBeTruthy();
  });
});

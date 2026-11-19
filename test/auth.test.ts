import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { conferirSenha, gerarHashSenha } from "../src/worker/seguranca/senha";
import { criarUsuario, req, tokenDoCookie } from "./ajuda";

// Cada login usa um IP próprio para não esbarrar no limite por IP (testado em limite.test.ts).
let proximoIp = 0;
const entrar = (usuario: string, senha: string) =>
  req("/api/auth/entrar", { metodo: "POST", corpo: { usuario, senha }, ip: `192.0.2.${++proximoIp % 250}-${proximoIp}` });

describe("senha", () => {
  it("confere a certa, rejeita a errada e usa sal diferente a cada hash", async () => {
    const hash = await gerarHashSenha("certa");
    expect(hash).toMatch(/^pbkdf2\$100000\$[^$]+\$[^$]+$/);
    expect(await conferirSenha("certa", hash)).toBe(true);
    expect(await conferirSenha("errada", hash)).toBe(false);
    expect(await gerarHashSenha("certa")).not.toBe(hash);
  });

  it("rejeita hash guardado malformado", async () => {
    expect(await conferirSenha("x", "lixo")).toBe(false);
  });
});

describe("login", () => {
  it("entra com a senha certa, com cookie seguro e sessão guardada só pelo hash", async () => {
    const u = await criarUsuario("barbeiro");
    const r = await entrar(u.usuario, u.senha);
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { usuario: Record<string, unknown> };
    expect(corpo.usuario).toEqual({ id: u.id, nome: `Nome ${u.usuario}`, papel: "barbeiro" });

    const cookie = r.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=2592000");

    const token = tokenDoCookie(r)!;
    expect(token.length).toBeGreaterThan(30);
    const { results } = await env.DB.prepare("SELECT id FROM sessoes WHERE usuario_id = ?").bind(u.id).all<{ id: string }>();
    expect(results.some((s) => s.id === token)).toBe(false);
    expect(results.every((s) => /^[0-9a-f]{64}$/.test(s.id))).toBe(true);

    expect((await req("/api/auth/eu", { token })).status).toBe(200);
  });

  it("usuário é case-insensitive", async () => {
    const u = await criarUsuario("dono", { usuario: "MariaSilva" });
    expect((await entrar("mariasilva", u.senha)).status).toBe(200);
  });

  it("usuário inexistente e senha errada dão a mesma resposta 401", async () => {
    const u = await criarUsuario("barbeiro");
    const a = await entrar(u.usuario, "errada");
    const b = await entrar("ninguem-existe", "errada");
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual({ erro: "Usuário ou senha incorretos." });
    expect(await b.json()).toEqual({ erro: "Usuário ou senha incorretos." });
  });

  it("usuário inativo recebe 401", async () => {
    const u = await criarUsuario("barbeiro", { ativo: false });
    const r = await entrar(u.usuario, u.senha);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erro: "Usuário ou senha incorretos." });
  });

  it("corpo inválido dá 400", async () => {
    const r = await req("/api/auth/entrar", { metodo: "POST", corpo: { usuario: 1 } });
    expect(r.status).toBe(400);
  });

  it("bloqueia na 5ª falha, mesmo com a senha certa, e libera depois do prazo", async () => {
    const u = await criarUsuario("barbeiro");
    for (let i = 0; i < 5; i++) expect((await entrar(u.usuario, "errada")).status).toBe(401);
    const bloqueada = await entrar(u.usuario, u.senha);
    expect(bloqueada.status).toBe(429);
    expect(await bloqueada.json()).toEqual({ erro: "Muitas tentativas. Tente de novo em 15 minutos." });

    const linha = await env.DB.prepare("SELECT falhas, bloqueado_ate FROM tentativas_login WHERE usuario = ?")
      .bind(u.usuario).first<{ falhas: number; bloqueado_ate: string }>();
    expect(linha!.falhas).toBeGreaterThanOrEqual(5);
    const minutos = (Date.parse(linha!.bloqueado_ate) - Date.now()) / 60000;
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15);

    await env.DB.prepare("UPDATE tentativas_login SET bloqueado_ate = ? WHERE usuario = ?")
      .bind(new Date(Date.now() - 1000).toISOString(), u.usuario).run();
    expect((await entrar(u.usuario, u.senha)).status).toBe(200);
    const depois = await env.DB.prepare("SELECT 1 FROM tentativas_login WHERE usuario = ?").bind(u.usuario).first();
    expect(depois).toBeNull();
  });

  it("tentativas erradas em paralelo não furam o bloqueio", async () => {
    const u = await criarUsuario("barbeiro");
    const respostas = await Promise.all(Array.from({ length: 10 }, () => entrar(u.usuario, "errada")));
    const status = respostas.map((r) => r.status);
    expect(status.filter((s) => s === 401).length).toBeLessThanOrEqual(5);
    expect(status.every((s) => s === 401 || s === 429)).toBe(true);
    expect((await entrar(u.usuario, u.senha)).status).toBe(429);
  });

  it("depois de expirar o bloqueio, uma nova falha não bloqueia de imediato", async () => {
    const u = await criarUsuario("barbeiro");
    for (let i = 0; i < 5; i++) await entrar(u.usuario, "errada");
    await env.DB.prepare("UPDATE tentativas_login SET bloqueado_ate = ? WHERE usuario = ?")
      .bind(new Date(Date.now() - 1000).toISOString(), u.usuario).run();
    expect((await entrar(u.usuario, "errada")).status).toBe(401);
    expect((await entrar(u.usuario, u.senha)).status).toBe(200);
  });

  it("login com sucesso zera as falhas anteriores", async () => {
    const u = await criarUsuario("barbeiro");
    for (let i = 0; i < 4; i++) await entrar(u.usuario, "errada");
    expect((await entrar(u.usuario, u.senha)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await entrar(u.usuario, "errada")).status).toBe(401);
    expect((await entrar(u.usuario, u.senha)).status).toBe(200);
  });
});

describe("sessão", () => {
  it("sair apaga a sessão, limpa o cookie e o /eu passa a dar 401", async () => {
    const u = await criarUsuario("dono");
    expect((await req("/api/auth/eu", { token: u.token })).status).toBe(200);
    const r = await req("/api/auth/sair", { metodo: "POST", token: u.token });
    expect(r.status).toBe(204);
    expect(r.headers.get("Set-Cookie") ?? "").toContain("Max-Age=0");
    expect((await req("/api/auth/eu", { token: u.token })).status).toBe(401);
    const { results } = await env.DB.prepare("SELECT id FROM sessoes WHERE usuario_id = ?").bind(u.id).all();
    expect(results).toHaveLength(0);
  });

  it("sair sem sessão também dá 204", async () => {
    expect((await req("/api/auth/sair", { metodo: "POST" })).status).toBe(204);
  });

  it("/eu sem cookie ou com token falso dá 401", async () => {
    expect((await req("/api/auth/eu")).status).toBe(401);
    expect((await req("/api/auth/eu", { token: "falso" })).status).toBe(401);
  });

  it("sessão expirada dá 401", async () => {
    const u = await criarUsuario("barbeiro");
    await env.DB.prepare("UPDATE sessoes SET expira_em = ? WHERE usuario_id = ?")
      .bind(new Date(Date.now() - 1000).toISOString(), u.id).run();
    expect((await req("/api/auth/eu", { token: u.token })).status).toBe(401);
  });

  it("usuário desativado perde o acesso mesmo com sessão válida", async () => {
    const u = await criarUsuario("barbeiro");
    await env.DB.prepare("UPDATE usuarios SET ativo = 0 WHERE id = ?").bind(u.id).run();
    expect((await req("/api/auth/eu", { token: u.token })).status).toBe(401);
  });

  it("renova a validade quando faltam menos de 29 dias", async () => {
    const u = await criarUsuario("barbeiro");
    const quase = new Date(Date.now() + 10 * 86400000).toISOString();
    await env.DB.prepare("UPDATE sessoes SET expira_em = ? WHERE usuario_id = ?").bind(quase, u.id).run();
    const r = await req("/api/auth/eu", { token: u.token });
    expect(r.status).toBe(200);
    const cookie = r.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain(`sessao=${u.token}`);
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("HttpOnly");
    const s = await env.DB.prepare("SELECT expira_em FROM sessoes WHERE usuario_id = ?").bind(u.id).first<{ expira_em: string }>();
    expect(Date.parse(s!.expira_em) - Date.now()).toBeGreaterThan(29 * 86400000);
  });
});

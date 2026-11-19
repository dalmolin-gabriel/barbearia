import { SELF, env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/worker/env";
import { exigirDono, exigirLogin, podeVerAgenda } from "../src/worker/seguranca/middleware";
import type { Usuario } from "../src/shared/tipos";
import { criarUsuario } from "./ajuda";

describe("cabeçalhos de segurança", () => {
  it("/api/saude traz os 4 cabeçalhos", async () => {
    const r = await SELF.fetch("https://exemplo.com/api/saude");
    expect(r.headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(r.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
  });

  it("também vêm nas respostas de erro (403)", async () => {
    const r = await SELF.fetch("https://exemplo.com/api/auth/entrar", { method: "POST", headers: { Origin: "https://malicioso.com" } });
    expect(r.status).toBe(403);
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("CSRF por Origin", () => {
  const corpo = JSON.stringify({ usuario: "x", senha: "y" });
  const post = (origem?: string) =>
    SELF.fetch("https://exemplo.com/api/auth/entrar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(origem ? { Origin: origem } : {}) },
      body: corpo,
    });

  it("Origin de outro site → 403", async () => {
    const r = await post("https://malicioso.com");
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ erro: "Origem não permitida." });
  });

  it("sem Origin → 403", async () => {
    expect((await post()).status).toBe(403);
  });

  it("Origin igual ao da requisição passa pela checagem", async () => {
    expect((await post("https://exemplo.com")).status).toBe(401);
  });

  it("GET não exige Origin", async () => {
    expect((await SELF.fetch("https://exemplo.com/api/saude")).status).toBe(200);
  });
});

function appDeTeste() {
  const app = new Hono<AppEnv>();
  app.get("/dono", exigirLogin(), exigirDono(), (c) => c.json({ id: c.var.usuario.id }));
  app.get("/logado", exigirLogin(), (c) => c.json({ id: c.var.usuario.id }));
  return app;
}
const pedir = (caminho: string, token?: string) =>
  appDeTeste().request(caminho, { headers: token ? { Cookie: `sessao=${token}` } : {} }, env);

describe("exigirLogin / exigirDono", () => {
  it("sem cookie → 401", async () => {
    expect((await pedir("/dono")).status).toBe(401);
    expect((await pedir("/logado")).status).toBe(401);
  });
  it("token inválido → 401", async () => {
    expect((await pedir("/logado", "invalido")).status).toBe(401);
  });
  it("barbeiro → 403 no que é do dono, 200 no que é de qualquer logado", async () => {
    const b = await criarUsuario("barbeiro");
    expect((await pedir("/dono", b.token)).status).toBe(403);
    const r = await pedir("/logado", b.token);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: b.id });
  });
  it("dono → 200", async () => {
    const d = await criarUsuario("dono");
    expect((await pedir("/dono", d.token)).status).toBe(200);
  });
  it("renova o cookie quando a sessão é renovada", async () => {
    const b = await criarUsuario("barbeiro");
    await env.DB.prepare("UPDATE sessoes SET expira_em = ?").bind(new Date(Date.now() + 86_400_000).toISOString()).run();
    const r = await pedir("/logado", b.token);
    expect(r.headers.get("Set-Cookie")).toContain(`sessao=${b.token}`);
  });
});

describe("podeVerAgenda", () => {
  const u = (papel: Usuario["papel"], id: string) => ({ id, papel }) as Usuario;
  it("dono vê qualquer agenda", () => expect(podeVerAgenda(u("dono", "a"), "b")).toBe(true));
  it("barbeiro só vê a própria", () => {
    expect(podeVerAgenda(u("barbeiro", "a"), "a")).toBe(true);
    expect(podeVerAgenda(u("barbeiro", "a"), "b")).toBe(false);
  });
});

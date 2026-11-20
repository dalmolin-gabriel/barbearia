import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { consumirLimite } from "../src/worker/seguranca/limite";
import { validarTurnstile } from "../src/worker/seguranca/turnstile";
import { req } from "./ajuda";

describe("consumirLimite", () => {
  it("permite até o máximo e bloqueia a chamada seguinte", async () => {
    const chave = `teste:${crypto.randomUUID()}`;
    const r = [];
    for (let i = 0; i < 3; i++) r.push(await consumirLimite(env.DB, chave, 2, 60));
    expect(r).toEqual([true, true, false]);
  });

  it("zera o contador quando a janela vence", async () => {
    const chave = `teste:${crypto.randomUUID()}`;
    await consumirLimite(env.DB, chave, 1, 60);
    expect(await consumirLimite(env.DB, chave, 1, 60)).toBe(false);
    await env.DB.prepare("UPDATE limites SET janela_inicio = ? WHERE chave = ?")
      .bind(new Date(Date.now() - 120_000).toISOString(), chave)
      .run();
    expect(await consumirLimite(env.DB, chave, 1, 60)).toBe(true);
    expect(await consumirLimite(env.DB, chave, 1, 60)).toBe(false);
  });
});

describe("validarTurnstile", () => {
  afterEach(() => vi.restoreAllMocks());

  const simular = (impl: () => Promise<Response>) => vi.spyOn(globalThis, "fetch").mockImplementation(impl);
  const resposta = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

  it("devolve true quando a Cloudflare confirma, enviando segredo, token e IP", async () => {
    const espiao = simular(async () => resposta({ success: true }));
    expect(await validarTurnstile("tok", "1.2.3.4", "segredo")).toBe(true);
    const [url, init] = espiao.mock.calls[0]!;
    expect(String(url)).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init?.method).toBe("POST");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("secret")).toBe("segredo");
    expect(form.get("response")).toBe("tok");
    expect(form.get("remoteip")).toBe("1.2.3.4");
  });

  it("devolve false quando success é false", async () => {
    simular(async () => resposta({ success: false }));
    expect(await validarTurnstile("tok", "1.2.3.4", "segredo")).toBe(false);
  });

  it("devolve false em erro de rede ou resposta inválida", async () => {
    simular(async () => {
      throw new TypeError("rede");
    });
    expect(await validarTurnstile("tok", "1.2.3.4", "segredo")).toBe(false);
    simular(async () => new Response("não é json", { status: 500 }));
    expect(await validarTurnstile("tok", "1.2.3.4", "segredo")).toBe(false);
  });

  it("devolve false para token vazio sem chamar a rede", async () => {
    const espiao = simular(async () => resposta({ success: true }));
    expect(await validarTurnstile("", "1.2.3.4", "segredo")).toBe(false);
    expect(espiao).not.toHaveBeenCalled();
  });
});

describe("limite por IP no login", () => {
  it("bloqueia a 21ª tentativa do mesmo IP, sem afetar outro IP", async () => {
    // Usuário diferente a cada tentativa, para não acionar o bloqueio por usuário.
    const entrar = (ip: string) =>
      req("/api/auth/entrar", { metodo: "POST", corpo: { email: `x-${crypto.randomUUID()}@exemplo.com`, senha: "x" }, ip });
    const ip = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;
    for (let i = 0; i < 20; i++) expect((await entrar(ip)).status).toBe(401);
    const bloqueada = await entrar(ip);
    expect(bloqueada.status).toBe(429);
    expect(await bloqueada.json()).toEqual({ erro: "Muitas tentativas. Tente de novo em 15 minutos." });
    expect((await entrar("10.9.9.9")).status).toBe(401);
  });
});

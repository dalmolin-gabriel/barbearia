import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SELF } from "cloudflare:test";
import { req } from "./ajuda";

// Terça-feira, 2026-12-01, 10:00 em Brasília = 13:00 UTC. O horário de 14:00 começa às 17:00 UTC (prazo de cancelamento: 15:00 UTC).
const AGORA = new Date("2026-12-01T13:00:00.000Z");
const TERCA = "2026-12-01";

let barbeiro = "";
let corte = "";
let ipSeq = 0;
const novoIp = () => `10.7.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;

async function semear() {
  for (const t of ["atendimentos", "clientes", "bloqueios", "expediente", "servicos", "limites", "usuarios"])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  barbeiro = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO usuarios (id, nome, usuario, senha_hash, papel, ativo, criado_em) VALUES (?, 'Zé', 'ze', 'x', 'barbeiro', 1, ?)",
  )
    .bind(barbeiro, new Date().toISOString())
    .run();
  for (let dia = 2; dia <= 6; dia++)
    await env.DB.prepare(
      "INSERT INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min) VALUES (?, ?, 1, 540, 1140, 720, 780)",
    )
      .bind(barbeiro, dia)
      .run();
  corte = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem) VALUES (?, 'Corte', 30, 4000, 1, 0)",
  )
    .bind(corte)
    .run();
}

async function agendar(hora = "14:00") {
  const r = await req("/api/publico/agendar", {
    metodo: "POST",
    ip: novoIp(),
    corpo: {
      barbeiro,
      servicos: [corte],
      data: TERCA,
      hora,
      nome: "João da Silva",
      telefone: "(11) 91234-5678",
      aceite: true,
      turnstile: "t",
    },
  });
  expect(r.status).toBe(201);
  return (await r.json()) as { id: string; tokenCliente: string };
}

const ver = (token: string, ip = novoIp()) => req(`/api/publico/meu-horario/${token}`, { ip });
const cancelar = (token: string, ip = novoIp()) =>
  req(`/api/publico/meu-horario/${token}/cancelar`, { metodo: "POST", ip });
const vagas = async () =>
  ((await (await req(`/api/publico/vagas?barbeiro=${barbeiro}&data=${TERCA}&servicos=${corte}`)).json()) as { horarios: string[] })
    .horarios;

describe("cliente vê e cancela o próprio horário", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ success: true })));
    await semear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("o agendamento devolve o token e o banco guarda só o SHA-256", async () => {
    const { id, tokenCliente } = await agendar();
    expect(tokenCliente).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const linha = await env.DB.prepare("SELECT token_cliente_hash AS h FROM atendimentos WHERE id = ?").bind(id).first<{ h: string }>();
    expect(linha?.h).toMatch(/^[0-9a-f]{64}$/);
    expect(linha?.h).not.toContain(tokenCliente);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tokenCliente));
    expect(linha?.h).toBe([...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""));
  });

  it("GET devolve os detalhes sem telefone nem dados de outros clientes", async () => {
    const { id, tokenCliente } = await agendar();
    const r = await ver(tokenCliente);
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).not.toContain("91234");
    expect(texto).not.toContain("João");
    expect(JSON.parse(texto)).toEqual({
      id,
      servicos_txt: "Corte",
      barbeiro: "Zé",
      inicio: "2026-12-01T17:00:00.000Z",
      fim: "2026-12-01T17:30:00.000Z",
      preco_centavos: 4000,
      status: "marcado",
      podeCancelar: true,
      limiteCancelamento: "2026-12-01T15:00:00.000Z",
    });
  });

  it("token desconhecido ou malformado dá 404", async () => {
    await agendar();
    for (const t of ["x".repeat(43), "curto", "a".repeat(200)]) {
      const r = await ver(t);
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ erro: "Horário não encontrado." });
      expect((await cancelar(t)).status).toBe(404);
    }
  });

  it("cancelar libera a vaga e marca o horário como cancelado", async () => {
    const { id, tokenCliente } = await agendar();
    expect(await vagas()).not.toContain("14:00");
    const r = await cancelar(tokenCliente);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(await vagas()).toContain("14:00");
    const linha = await env.DB.prepare("SELECT status FROM atendimentos WHERE id = ?").bind(id).first<{ status: string }>();
    expect(linha?.status).toBe("cancelado");
    const depois = (await (await ver(tokenCliente)).json()) as { status: string; podeCancelar: boolean };
    expect(depois).toMatchObject({ status: "cancelado", podeCancelar: false });
  });

  it("cancelar de novo dá 409", async () => {
    const { tokenCliente } = await agendar();
    expect((await cancelar(tokenCliente)).status).toBe(200);
    const r = await cancelar(tokenCliente);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ erro: "Este horário já foi cancelado." });
  });

  it("faltando menos de 2 horas dá 422; no limite exato ainda cancela", async () => {
    const { id, tokenCliente } = await agendar();
    vi.setSystemTime(new Date("2026-12-01T15:00:00.001Z"));
    const ver422 = (await (await ver(tokenCliente)).json()) as { podeCancelar: boolean };
    expect(ver422.podeCancelar).toBe(false);
    const r = await cancelar(tokenCliente);
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({
      erro: "Faltam menos de 2 horas. Para cancelar, fale com a barbearia pelo WhatsApp.",
    });
    const linha = await env.DB.prepare("SELECT status FROM atendimentos WHERE id = ?").bind(id).first<{ status: string }>();
    expect(linha?.status).toBe("marcado");

    vi.setSystemTime(new Date("2026-12-01T15:00:00.000Z"));
    expect((await cancelar(tokenCliente)).status).toBe(200);
  });

  it("cancelar exige o mesmo Origin", async () => {
    const { tokenCliente } = await agendar();
    const r = await SELF.fetch(`https://exemplo.com/api/publico/meu-horario/${tokenCliente}/cancelar`, {
      method: "POST",
      headers: { Origin: "https://atacante.com", "CF-Connecting-IP": novoIp() },
    });
    expect(r.status).toBe(403);
    const semOrigem = await SELF.fetch(`https://exemplo.com/api/publico/meu-horario/${tokenCliente}/cancelar`, { method: "POST" });
    expect(semOrigem.status).toBe(403);
    expect(((await (await ver(tokenCliente)).json()) as { status: string }).status).toBe("marcado");
  });

  it("limita por IP: 60 consultas e 10 cancelamentos por hora", async () => {
    const ip = "10.9.9.9";
    const { tokenCliente } = await agendar();
    for (let n = 0; n < 60; n++) expect((await ver(tokenCliente, ip)).status).toBe(200);
    expect((await ver(tokenCliente, ip)).status).toBe(429);
    for (let n = 0; n < 10; n++) expect((await cancelar("x".repeat(43), "10.9.9.8")).status).toBe(404);
    expect((await cancelar("x".repeat(43), "10.9.9.8")).status).toBe(429);
  });
});

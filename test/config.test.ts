import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { criarUsuario, req } from "./ajuda";

let dono: { token: string };
let barbeiro: { token: string };
let ipSeq = 0;
const novoIp = () => `10.7.0.${(++ipSeq % 250) + 1}`;

const valido = { aberturaDia: 5, aberturaMinuto: 1080, semanas: 2 };

beforeEach(async () => {
  for (const t of ["sessoes", "usuarios", "limites"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.batch([
    env.DB.prepare("UPDATE config SET valor = '6' WHERE chave = 'abertura_dia'"),
    env.DB.prepare("UPDATE config SET valor = '1380' WHERE chave = 'abertura_minuto'"),
    env.DB.prepare("UPDATE config SET valor = '1' WHERE chave = 'semanas_abertas'"),
  ]);
  dono = await criarUsuario("dono");
  barbeiro = await criarUsuario("barbeiro");
});

const put = (token: string, corpo: unknown) =>
  req("/api/config/agenda", { metodo: "PUT", token, corpo, ip: novoIp() });

describe("/api/config/agenda", () => {
  it("exige login", async () => {
    expect((await req("/api/config/agenda", { ip: novoIp() })).status).toBe(401);
  });

  it("GET devolve o padrão para a equipe", async () => {
    const r = await req("/api/config/agenda", { token: barbeiro.token, ip: novoIp() });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ aberturaDia: 6, aberturaMinuto: 1380, semanas: 1 });
  });

  it("barbeiro não altera (403)", async () => {
    expect((await put(barbeiro.token, valido)).status).toBe(403);
  });

  it("valores inválidos dão 400", async () => {
    for (const ruim of [
      { ...valido, aberturaDia: 0 },
      { ...valido, aberturaDia: 7 },
      { ...valido, aberturaMinuto: 1440 },
      { ...valido, aberturaMinuto: 1100 },
      { ...valido, aberturaMinuto: -15 },
      { ...valido, semanas: 3 },
      { ...valido, semanas: "2" },
      { aberturaDia: 5 },
    ]) {
      const r = await put(dono.token, ruim);
      expect(r.status, JSON.stringify(ruim)).toBe(400);
      expect(((await r.json()) as { erro: string }).erro).toMatch(/inválidos/);
    }
  });

  it("dono grava e o GET e o /info refletem", async () => {
    const r = await put(dono.token, valido);
    expect(r.status).toBe(200);
    const g = await req("/api/config/agenda", { token: barbeiro.token, ip: novoIp() });
    expect(await g.json()).toEqual(valido);
    const info = (await (await req("/api/publico/info", { ip: novoIp() })).json()) as {
      dias: string[];
      abertura: { dia: number; minuto: number; semanas: number };
    };
    expect(info.abertura).toEqual({ dia: 5, minuto: 1080, semanas: 2 });
    // Com 2 semanas o prazo vai ao menos 7 dias além do que 1 semana daria.
    await put(dono.token, { ...valido, semanas: 1 });
    const um = (await (await req("/api/publico/info", { ip: novoIp() })).json()) as { dias: string[] };
    expect(info.dias.length).toBeGreaterThan(um.dias.length);
  });
});

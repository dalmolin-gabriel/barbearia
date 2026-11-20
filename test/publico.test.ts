import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inserirSemConflito } from "../src/worker/db/consultas";
import { diasAbertosCliente } from "../src/shared/janela";
import { req } from "./ajuda";

// Terça-feira, 2026-12-01, 10:00 em Brasília (UTC-3) = 13:00 UTC.
const AGORA = new Date("2026-12-01T13:00:00.000Z");
const TERCA = "2026-12-01";

let barbeiro = "";
let corte = "";
let barba = "";
let ipSeq = 0;

const novoIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;

async function semear() {
  for (const t of [
    "atendimentos",
    "clientes",
    "bloqueios",
    "expediente",
    "servicos",
    "limites",
    "usuarios",
  ])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  barbeiro = await criarBarbeiro("Zé", "barbeiro", 1, true);
  corte = await criarServico("Corte", 30, 4000, 1);
  barba = await criarServico("Barba", 20, 3000, 1);
}

async function criarBarbeiro(
  nome: string,
  papel: "dono" | "barbeiro",
  ativo: number,
  comExpediente: boolean,
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO usuarios (id, nome, usuario, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, 'x', ?, ?, ?)",
  )
    .bind(
      id,
      nome,
      `u-${id.slice(0, 8)}`,
      papel,
      ativo,
      new Date().toISOString(),
    )
    .run();
  if (comExpediente)
    for (let dia = 0; dia <= 6; dia++) {
      const aberto = dia >= 2 && dia <= 6 ? 1 : 0;
      await env.DB.prepare(
        "INSERT INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min) VALUES (?, ?, ?, 540, 1140, 720, 780)",
      )
        .bind(id, dia, aberto)
        .run();
    }
  return id;
}

async function criarServico(
  nome: string,
  duracao: number,
  preco: number,
  ativo: number,
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem) VALUES (?, ?, ?, ?, ?, 0)",
  )
    .bind(id, nome, duracao, preco, ativo)
    .run();
  return id;
}

const contar = async (tabela: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).first<{
    n: number;
  }>())!.n;

const corpoValido = (extra: Record<string, unknown> = {}) => ({
  barbeiro,
  servicos: [corte],
  data: TERCA,
  hora: "11:00",
  nome: "João da Silva",
  telefone: "(11) 91234-5678",
  aceite: true,
  turnstile: "token",
  ...extra,
});

const agendar = (corpo: unknown, ip = novoIp()) =>
  req("/api/publico/agendar", { metodo: "POST", corpo, ip });

function simularTurnstile(sucesso: boolean) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify({ success: sucesso })),
  );
}

describe("API pública de agendamento", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
    simularTurnstile(true);
    await semear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("info", () => {
    it("lista só barbeiros e serviços ativos, e os dias iguais aos da Task 3", async () => {
      await criarBarbeiro("Inativo", "barbeiro", 0, true);
      await criarBarbeiro("SemExpediente", "barbeiro", 1, false);
      await criarServico("Antigo", 30, 1000, 0);
      const dono = await criarBarbeiro("Dono", "dono", 1, true);
      const r = await req("/api/publico/info", { ip: novoIp() });
      expect(r.status).toBe(200);
      const j = (await r.json()) as any;
      expect(j.barbearia.nome).toBe("Barbearia dos Padilhas");
      expect(j.barbeiros.map((b: any) => b.id).sort()).toEqual(
        [barbeiro, dono].sort(),
      );
      expect(j.servicos.map((s: any) => s.nome).sort()).toEqual([
        "Barba",
        "Corte",
      ]);
      expect(j.dias).toEqual(
        diasAbertosCliente(AGORA, { aberturaDia: 6, aberturaMinuto: 1380 }),
      );
      expect(j.turnstileSiteKey).toBeTruthy();
    });

    it("sem TURNSTILE_SITE_KEY configurada, devolve a chave como texto vazio", async () => {
      const original = env.TURNSTILE_SITE_KEY;
      delete (env as { TURNSTILE_SITE_KEY?: string }).TURNSTILE_SITE_KEY;
      try {
        const j = (await (
          await req("/api/publico/info", { ip: novoIp() })
        ).json()) as any;
        expect(j.turnstileSiteKey).toBe("");
      } finally {
        env.TURNSTILE_SITE_KEY = original;
      }
    });
  });

  describe("vagas", () => {
    const vagas = (data: string, servicos = corte) =>
      req(
        `/api/publico/vagas?barbeiro=${barbeiro}&data=${data}&servicos=${servicos}`,
        { ip: novoIp() },
      );

    it("mais de um serviço: 400", async () => {
      const r = await vagas(TERCA, `${corte},${barba}`);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ erro: "Escolha apenas um serviço." });
    });

    it("hoje começa às 10:30", async () => {
      const j = (await (await vagas(TERCA)).json()) as { horarios: string[] };
      expect(j.horarios[0]).toBe("10:30");
      expect(j.horarios).not.toContain("12:00");
    });
    it("fora da janela e domingo dão lista vazia", async () => {
      expect(await (await vagas("2026-12-08")).json()).toEqual({
        horarios: [],
      });
      expect(await (await vagas("2026-12-06")).json()).toEqual({
        horarios: [],
      });
    });
    it("não vaza nome nem telefone", async () => {
      expect((await agendar(corpoValido())).status).toBe(201);
      const texto = await (await vagas(TERCA)).text();
      expect(texto).not.toContain("nome");
      expect(texto).not.toContain("João");
      expect(texto).not.toContain("91234");
      expect(texto).not.toContain("11:00");
    });
    it("descarta horário que cai em bloqueio da barbearia toda", async () => {
      await env.DB.prepare(
        "INSERT INTO bloqueios (id, usuario_id, inicio, fim, motivo, criado_por) VALUES (?, NULL, ?, ?, '', ?)",
      )
        .bind(
          crypto.randomUUID(),
          "2026-12-01T14:00:00.000Z",
          "2026-12-01T15:00:00.000Z",
          barbeiro,
        )
        .run();
      const j = (await (await vagas(TERCA)).json()) as { horarios: string[] };
      expect(j.horarios).not.toContain("11:15");
      expect(j.horarios).toContain("10:30");
      expect(j.horarios).toContain("12:00".replace("12:00", "13:00"));
    });
  });

  describe("agendar", () => {
    it("válido: 201, preço 4000, duração 30", async () => {
      const r = await agendar(corpoValido());
      expect(r.status).toBe(201);
      const j = (await r.json()) as any;
      expect(j.preco_centavos).toBe(4000);
      expect(j.servicos_txt).toBe("Corte");
      expect(j.barbeiro).toBe("Zé");
      expect(j.inicio).toBe("2026-12-01T14:00:00.000Z");
      expect(j.fim).toBe("2026-12-01T14:30:00.000Z");
      const linha = await env.DB.prepare(
        "SELECT duracao_min, origem, status FROM atendimentos",
      ).first<any>();
      expect(linha).toEqual({
        duracao_min: 30,
        origem: "online",
        status: "marcado",
      });
      expect(JSON.stringify(j)).not.toContain("91234");
    });

    it("repetida: 201 e depois 409, com uma só linha", async () => {
      expect((await agendar(corpoValido())).status).toBe(201);
      const r = await agendar(corpoValido());
      expect(r.status).toBe(409);
      expect(((await r.json()) as any).erro).toBe(
        "Esse horário acabou de ser reservado. Escolha outro.",
      );
      expect(await contar("atendimentos")).toBe(1);
    });

    it("duas em paralelo no mesmo horário: exatamente um 201", async () => {
      const rs = await Promise.all([
        agendar(corpoValido()),
        agendar(corpoValido({ nome: "Outro", telefone: "11 98888-7777" })),
      ]);
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await contar("atendimentos")).toBe(1);
    });

    it("3º agendamento do mesmo celular em outro formato: 422", async () => {
      expect(
        (await agendar(corpoValido({ hora: "11:00", servicos: [corte] })))
          .status,
      ).toBe(201);
      expect(
        (
          await agendar(
            corpoValido({
              hora: "13:00",
              servicos: [corte],
              telefone: "+55 11 91234-5678",
            }),
          )
        ).status,
      ).toBe(201);
      const r = await agendar(
        corpoValido({
          hora: "15:00",
          servicos: [corte],
          telefone: "11912345678",
        }),
      );
      expect(r.status).toBe(422);
      expect(((await r.json()) as any).erro).toBe(
        "Você já tem 2 horários marcados. Para marcar outro, fale com a barbearia.",
      );
      expect(await contar("clientes")).toBe(1);
    });

    it("agendamento cancelado ou passado não conta para o limite", async () => {
      expect(
        (await agendar(corpoValido({ hora: "11:00", servicos: [corte] })))
          .status,
      ).toBe(201);
      expect(
        (await agendar(corpoValido({ hora: "13:00", servicos: [corte] })))
          .status,
      ).toBe(201);
      await env.DB.prepare(
        "UPDATE atendimentos SET status = 'cancelado' WHERE inicio LIKE '%T14:00%'",
      ).run();
      expect(
        (await agendar(corpoValido({ hora: "15:00", servicos: [corte] })))
          .status,
      ).toBe(201);
    });

    it("cliente removido é reativado com o novo nome", async () => {
      await env.DB.prepare(
        "INSERT INTO clientes (id, nome, telefone, removido, criado_em) VALUES ('c1', 'Antigo', '5511912345678', 1, ?)",
      )
        .bind(new Date().toISOString())
        .run();
      expect((await agendar(corpoValido())).status).toBe(201);
      const c = await env.DB.prepare(
        "SELECT id, nome, removido, aceite_em FROM clientes",
      ).first<any>();
      expect(c.id).toBe("c1");
      expect(c.nome).toBe("João da Silva");
      expect(c.removido).toBe(0);
      expect(c.aceite_em).toBeTruthy();
    });

    it("barbeiro inativo: 400", async () => {
      const inativo = await criarBarbeiro("Off", "barbeiro", 0, true);
      expect((await agendar(corpoValido({ barbeiro: inativo }))).status).toBe(
        400,
      );
    });
    it("serviço inativo ou inexistente: 400", async () => {
      const antigo = await criarServico("Antigo", 30, 1000, 0);
      expect((await agendar(corpoValido({ servicos: [antigo] }))).status).toBe(
        400,
      );
      expect(
        (await agendar(corpoValido({ servicos: [crypto.randomUUID()] })))
          .status,
      ).toBe(400);
    });
    it("fora do expediente (20:00): 400 com mensagem de indisponível", async () => {
      const r = await agendar(corpoValido({ hora: "20:00" }));
      expect(r.status).toBe(400);
      expect(((await r.json()) as any).erro).toBe(
        "Esse horário não está disponível. Escolha outro.",
      );
    });
    it("horário fora da grade de 15 minutos, no passado ou durante o almoço não grava", async () => {
      for (const hora of ["11:10", "09:00", "12:00"]) {
        expect((await agendar(corpoValido({ hora }))).status).toBe(400);
      }
      expect(await contar("atendimentos")).toBe(0);
    });
    it("horário em bloqueio do barbeiro: 400", async () => {
      await env.DB.prepare(
        "INSERT INTO bloqueios (id, usuario_id, inicio, fim, motivo, criado_por) VALUES (?, ?, ?, ?, '', ?)",
      )
        .bind(
          crypto.randomUUID(),
          barbeiro,
          "2026-12-01T14:00:00.000Z",
          "2026-12-01T15:00:00.000Z",
          barbeiro,
        )
        .run();
      expect((await agendar(corpoValido())).status).toBe(400);
      expect(await contar("atendimentos")).toBe(0);
    });
    it("inserirSemConflito recusa se um bloqueio da barbearia toda surgiu antes da gravação", async () => {
      await env.DB.prepare(
        "INSERT INTO clientes (id, nome, telefone, criado_em) VALUES ('c9', 'X', '5511900000000', ?)",
      )
        .bind(AGORA.toISOString())
        .run();
      await env.DB.prepare(
        "INSERT INTO bloqueios (id, usuario_id, inicio, fim, motivo, criado_por) VALUES (?, NULL, ?, ?, '', ?)",
      )
        .bind(
          crypto.randomUUID(),
          "2026-12-01T14:00:00.000Z",
          "2026-12-01T15:00:00.000Z",
          barbeiro,
        )
        .run();
      const novo = (inicio: string, fim: string) => ({
        id: crypto.randomUUID(),
        clienteId: "c9",
        usuarioId: barbeiro,
        servicosTxt: "Corte",
        duracaoMin: 30,
        precoCentavos: 4000,
        inicio,
        fim,
        origem: "painel" as const,
        agora: AGORA.toISOString(),
      });
      expect(
        await inserirSemConflito(
          env.DB,
          novo("2026-12-01T14:15:00.000Z", "2026-12-01T14:45:00.000Z"),
        ),
      ).toBe(false);
      expect(
        await inserirSemConflito(
          env.DB,
          novo("2026-12-01T15:00:00.000Z", "2026-12-01T15:30:00.000Z"),
        ),
      ).toBe(true);
    });
    it("5 agendamentos paralelos do mesmo celular (formatos diferentes): só 2 passam", async () => {
      const tels = [
        "(11) 91234-5678",
        "11912345678",
        "+55 11 91234-5678",
        "5511912345678",
        "11 91234 5678",
      ];
      const horas = ["10:30", "11:00", "13:00", "14:00", "15:00"];
      const rs = await Promise.all(
        horas.map((hora, i) =>
          agendar(corpoValido({ hora, servicos: [corte], telefone: tels[i] })),
        ),
      );
      const codigos = rs.map((r) => r.status);
      expect(codigos.filter((s) => s === 201)).toHaveLength(2);
      expect(codigos.filter((s) => s === 422)).toHaveLength(3);
      expect(await contar("atendimentos")).toBe(2);
    });
    it("cliente existente mantém o nome gravado", async () => {
      await env.DB.prepare(
        "INSERT INTO clientes (id, nome, telefone, removido, criado_em) VALUES ('c2', 'Maria', '5511912345678', 0, ?)",
      )
        .bind(AGORA.toISOString())
        .run();
      expect((await agendar(corpoValido({ nome: "Hacker" }))).status).toBe(201);
      expect(
        (
          await env.DB.prepare(
            "SELECT nome FROM clientes WHERE id = 'c2'",
          ).first<any>()
        ).nome,
      ).toBe("Maria");
    });
    it("corpo acima de 8 KB: 413", async () => {
      const r = await agendar(corpoValido({ nome: "a".repeat(9000) }));
      expect(r.status).toBe(413);
      expect(((await r.json()) as any).erro).toBe("Requisição muito grande.");
    });
    it("fora da janela (2026-12-08): 400 ou 409", async () => {
      expect([400, 409]).toContain(
        (await agendar(corpoValido({ data: "2026-12-08" }))).status,
      );
    });
    it("sem aceite: 400", async () => {
      expect((await agendar(corpoValido({ aceite: false }))).status).toBe(400);
      const { aceite: _a, ...sem } = corpoValido();
      expect((await agendar(sem)).status).toBe(400);
    });
    it("nome com 61 caracteres: 400", async () => {
      expect(
        (await agendar(corpoValido({ nome: "a".repeat(61) }))).status,
      ).toBe(400);
    });
    it("telefone inválido: 400", async () => {
      expect((await agendar(corpoValido({ telefone: "123" }))).status).toBe(
        400,
      );
    });
    it("serviços repetidos ou vazios: 400", async () => {
      expect(
        (await agendar(corpoValido({ servicos: [corte, corte] }))).status,
      ).toBe(400);
      expect((await agendar(corpoValido({ servicos: [] }))).status).toBe(400);
    });
    it("mais de um serviço: 400 com mensagem e nada gravado", async () => {
      const r = await agendar(corpoValido({ servicos: [corte, barba] }));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ erro: "Escolha apenas um serviço." });
      expect(await contar("atendimentos")).toBe(0);
    });
    it("Turnstile reprovado: 403", async () => {
      vi.restoreAllMocks();
      simularTurnstile(false);
      expect((await agendar(corpoValido())).status).toBe(403);
      expect(await contar("atendimentos")).toBe(0);
    });
    it("TURNSTILE_VERIFY_URL troca o endereço de verificação (e2e sem internet)", async () => {
      const chamadas: string[] = [];
      vi.restoreAllMocks();
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        chamadas.push(String(url));
        return new Response(JSON.stringify({ success: true }));
      });
      (env as any).TURNSTILE_VERIFY_URL = "http://127.0.0.1:8788/siteverify";
      try {
        expect((await agendar(corpoValido())).status).toBe(201);
        expect(chamadas[0]).toBe("http://127.0.0.1:8788/siteverify");
      } finally {
        delete (env as any).TURNSTILE_VERIFY_URL;
      }
    });
    it("TURNSTILE_VERIFY_URL fora de localhost é ignorada (usa a URL real da Cloudflare)", async () => {
      const chamadas: string[] = [];
      vi.restoreAllMocks();
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        chamadas.push(String(url));
        return new Response(JSON.stringify({ success: true }));
      });
      (env as any).TURNSTILE_VERIFY_URL = "https://evil.example/verify";
      try {
        expect((await agendar(corpoValido())).status).toBe(201);
        expect(chamadas[0]).toBe(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        );
      } finally {
        delete (env as any).TURNSTILE_VERIFY_URL;
      }
    });
    it("sem TURNSTILE_SECRET: 503 (fecha por segurança)", async () => {
      const segredo = env.TURNSTILE_SECRET;
      (env as any).TURNSTILE_SECRET = "";
      try {
        const r = await agendar(corpoValido());
        expect(r.status).toBe(503);
        expect(((await r.json()) as any).erro).toBe(
          "Agendamento temporariamente indisponível.",
        );
      } finally {
        (env as any).TURNSTILE_SECRET = segredo;
      }
    });
    it("limite por IP: 11º agendamento em uma hora recebe 429", async () => {
      const ip = "172.16.0.9";
      const codigos: number[] = [];
      for (let i = 0; i < 11; i++)
        codigos.push(
          (await agendar(corpoValido({ aceite: false }), ip)).status,
        );
      expect(codigos.slice(0, 10).every((s) => s === 400)).toBe(true);
      expect(codigos[10]).toBe(429);
    });
    it("limite de consulta por IP: 121ª em um minuto recebe 429", async () => {
      const ip = "172.16.0.10";
      let ultimo = 0;
      for (let i = 0; i < 121; i++)
        ultimo = (await req("/api/publico/info", { ip })).status;
      expect(ultimo).toBe(429);
    });
    it("corpo que não é JSON: 400", async () => {
      const r = await req("/api/publico/agendar", {
        metodo: "POST",
        corpo: "texto",
        ip: novoIp(),
      });
      expect(r.status).toBe(400);
    });
  });
});

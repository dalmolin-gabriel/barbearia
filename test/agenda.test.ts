import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instanteUTC } from "../src/shared/tempo";
import { criarUsuario, req } from "./ajuda";

// Terça-feira, 2026-12-01, 10:00 em Brasília (UTC-3) = 13:00 UTC.
const AGORA = new Date("2026-12-01T13:00:00.000Z");
const TERCA = "2026-12-01"; // o "hoje" dos testes
const QUARTA = "2026-12-02";

let dono: { id: string; token: string };
let b1: { id: string; token: string };
let b2: { id: string; token: string };
let corte = "";
let barba = "";
let ipSeq = 0;
const novoIp = () => `10.1.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;

async function semear() {
  for (const t of [
    "atendimentos",
    "clientes",
    "bloqueios",
    "expediente",
    "servicos",
    "limites",
    "sessoes",
    "usuarios",
  ])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  dono = await criarUsuario("dono");
  b1 = await criarUsuario("barbeiro");
  b2 = await criarUsuario("barbeiro");
  for (const u of [dono, b1, b2])
    for (let dia = 0; dia <= 6; dia++)
      await env.DB.prepare(
        "INSERT INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min) VALUES (?, ?, ?, 540, 1140, 720, 780)",
      )
        .bind(u.id, dia, dia >= 2 && dia <= 6 ? 1 : 0)
        .run();
  corte = await criarServico("Corte", 30, 4000);
  barba = await criarServico("Barba", 20, 3000);
}

async function criarServico(nome: string, duracao: number, preco: number) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem) VALUES (?, ?, ?, ?, 1, 0)",
  )
    .bind(id, nome, duracao, preco)
    .run();
  return id;
}

/** Atendimento semeado direto no banco; `hora` em minutos desde 00:00 locais. */
async function semearAtendimento(
  usuarioId: string,
  data: string,
  minuto: number,
  extra: { status?: string; duracao?: number; nome?: string } = {},
) {
  const duracao = extra.duracao ?? 30;
  const clienteId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO clientes (id, nome, telefone, removido, criado_em) VALUES (?, ?, ?, 0, ?)",
  )
    .bind(clienteId, extra.nome ?? "Cliente", `119${Math.random().toString().slice(2, 10)}`, "x")
    .run();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO atendimentos (id, cliente_id, usuario_id, servicos_txt, duracao_min, preco_centavos, inicio, fim, status, origem, criado_em, atualizado_em) VALUES (?, ?, ?, 'Corte', ?, 4000, ?, ?, ?, 'painel', 'x', 'x')",
  )
    .bind(
      id,
      clienteId,
      usuarioId,
      duracao,
      instanteUTC(data, minuto).toISOString(),
      instanteUTC(data, minuto + duracao).toISOString(),
      extra.status ?? "marcado",
    )
    .run();
  return id;
}

const vagas = async (barbeiro: string, data: string) => {
  const r = await req(
    `/api/publico/vagas?barbeiro=${barbeiro}&data=${data}&servicos=${corte}`,
    { ip: novoIp() },
  );
  return ((await r.json()) as { horarios: string[] }).horarios;
};

const contar = async (tabela: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).first<{ n: number }>())!.n;

const marcar = (token: string, corpo: Record<string, unknown>) =>
  req("/api/atendimentos", {
    metodo: "POST",
    token,
    corpo: { nome: "Fulano", servicos: [corte], data: QUARTA, hora: "10:00", ...corpo },
  });

describe("agenda do painel", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
    await semear();
  });
  afterEach(() => vi.useRealTimers());

  it("exige login", async () => {
    expect((await req(`/api/agenda?data=${QUARTA}`)).status).toBe(401);
    expect((await req("/api/bloqueios")).status).toBe(401);
  });

  describe("listagem", () => {
    it("barbeiro com quem=todos recebe só os dele; o dono recebe todos, ordenados", async () => {
      await semearAtendimento(b1.id, QUARTA, 600, { nome: "Do B1" });
      await semearAtendimento(b2.id, QUARTA, 540, { nome: "Do B2" });
      const rb = await req(`/api/agenda?data=${QUARTA}&quem=todos`, { token: b1.token });
      const jb = (await rb.json()) as any;
      expect(jb.atendimentos.map((a: any) => a.cliente_nome)).toEqual(["Do B1"]);
      const rd = await req(`/api/agenda?data=${QUARTA}&quem=todos`, { token: dono.token });
      const jd = (await rd.json()) as any;
      expect(jd.atendimentos.map((a: any) => a.cliente_nome)).toEqual(["Do B2", "Do B1"]);
      expect(jd.atendimentos[0].barbeiro_nome).toBeTruthy();
      expect(jd.atendimentos[0].servicos_txt).toBe("Corte");
      expect(jd.data).toBe(QUARTA);
    });

    it("quem=meus do dono traz só os dele; dia usa a fronteira de Brasília", async () => {
      await semearAtendimento(dono.id, QUARTA, 540);
      await semearAtendimento(b1.id, QUARTA, 600);
      // 23:30 local do dia anterior e 00:00 do dia seguinte ficam de fora.
      await semearAtendimento(dono.id, "2026-12-01", 1410);
      await semearAtendimento(dono.id, "2026-12-03", 0);
      const j = (await (await req(`/api/agenda?data=${QUARTA}&quem=meus`, { token: dono.token })).json()) as any;
      expect(j.atendimentos).toHaveLength(1);
    });

    it("valida a data", async () => {
      expect((await req("/api/agenda?data=ontem", { token: b1.token })).status).toBe(400);
      expect((await req("/api/agenda?data=2026-02-30", { token: b1.token })).status).toBe(400);
    });
  });

  describe("permissões sobre o atendimento", () => {
    it("barbeiro lê, muda a situação e remarca atendimento alheio: 404", async () => {
      const id = await semearAtendimento(b2.id, QUARTA, 600);
      expect((await req(`/api/atendimentos/${id}`, { token: b1.token })).status).toBe(404);
      const s = await req(`/api/atendimentos/${id}/situacao`, {
        metodo: "PATCH",
        token: b1.token,
        corpo: { situacao: "cancelado" },
      });
      expect(s.status).toBe(404);
      const r = await req(`/api/atendimentos/${id}/remarcar`, {
        metodo: "PATCH",
        token: b1.token,
        corpo: { data: QUARTA, hora: "15:00" },
      });
      expect(r.status).toBe(404);
      const linha = await env.DB.prepare("SELECT status FROM atendimentos WHERE id = ?").bind(id).first<any>();
      expect(linha.status).toBe("marcado");
      // O dono enxerga.
      const ok = await req(`/api/atendimentos/${id}`, { token: dono.token });
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as any).cliente_nome).toBe("Cliente");
    });

    it("barbeiro não remarca para outro barbeiro nem marca para ele: 403", async () => {
      const id = await semearAtendimento(b1.id, QUARTA, 600);
      const r = await req(`/api/atendimentos/${id}/remarcar`, {
        metodo: "PATCH",
        token: b1.token,
        corpo: { data: QUARTA, hora: "15:00", usuarioId: b2.id },
      });
      expect(r.status).toBe(403);
      expect((await marcar(b1.token, { usuarioId: b2.id })).status).toBe(403);
      expect(await contar("atendimentos")).toBe(1);
    });
  });

  describe("situação", () => {
    it("cancelado libera o horário; reabrir em horário ocupado dá 409", async () => {
      const id = await semearAtendimento(b1.id, QUARTA, 600);
      expect(await vagas(b1.id, QUARTA)).not.toContain("10:00");
      const r = await req(`/api/atendimentos/${id}/situacao`, {
        metodo: "PATCH",
        token: b1.token,
        corpo: { situacao: "cancelado" },
      });
      expect(r.status).toBe(200);
      expect(await vagas(b1.id, QUARTA)).toContain("10:00");
      // Outro toma o horário; reabrir o cancelado agora conflita.
      await semearAtendimento(b1.id, QUARTA, 600);
      const re = await req(`/api/atendimentos/${id}/situacao`, {
        metodo: "PATCH",
        token: b1.token,
        corpo: { situacao: "marcado" },
      });
      expect(re.status).toBe(409);
    });

    it("confirma, atende e rejeita valor inválido", async () => {
      const id = await semearAtendimento(b1.id, TERCA, 720);
      for (const situacao of ["confirmado", "atendido", "faltou"]) {
        const r = await req(`/api/atendimentos/${id}/situacao`, {
          metodo: "PATCH",
          token: b1.token,
          corpo: { situacao },
        });
        expect(r.status).toBe(200);
      }
      const ruim = await req(`/api/atendimentos/${id}/situacao`, {
        metodo: "PATCH",
        token: b1.token,
        corpo: { situacao: "inventado" },
      });
      expect(ruim.status).toBe(400);
    });

    it("atendimento de amanhã: atendido e faltou dão 400 e nada muda; confirmado passa", async () => {
      const id = await semearAtendimento(b1.id, QUARTA, 600);
      const patch = (situacao: string) =>
        req(`/api/atendimentos/${id}/situacao`, { metodo: "PATCH", token: b1.token, corpo: { situacao } });
      const status = async () =>
        (await env.DB.prepare("SELECT status FROM atendimentos WHERE id = ?").bind(id).first<any>()).status;
      for (const situacao of ["atendido", "faltou"]) {
        const r = await patch(situacao);
        expect(r.status).toBe(400);
        expect(((await r.json()) as any).erro).toBe('Só dá para marcar "Chegou" ou "Faltou" no dia do atendimento.');
        expect(await status()).toBe("marcado");
      }
      expect((await patch("confirmado")).status).toBe(200);
      expect(await status()).toBe("confirmado");
    });

    it("atendimento de hoje (mesmo à noite, em Brasília) pode ser marcado atendido", async () => {
      const id = await semearAtendimento(b1.id, TERCA, 1110);
      const r = await req(`/api/atendimentos/${id}/situacao`, {
        metodo: "PATCH",
        token: b1.token,
        corpo: { situacao: "atendido" },
      });
      expect(r.status).toBe(200);
    });
  });

  describe("correções da revisão", () => {
    it("atendimento que mudou de barbeiro: situação e remarcar dão 404 e nada muda", async () => {
      const id = await semearAtendimento(b1.id, QUARTA, 600);
      await env.DB.prepare("UPDATE atendimentos SET usuario_id = ? WHERE id = ?").bind(b2.id, id).run();
      const antes = await env.DB.prepare("SELECT * FROM atendimentos WHERE id = ?").bind(id).first<any>();
      const s = await req(`/api/atendimentos/${id}/situacao`, { metodo: "PATCH", token: b1.token, corpo: { situacao: "cancelado" } });
      const r = await req(`/api/atendimentos/${id}/remarcar`, { metodo: "PATCH", token: b1.token, corpo: { data: QUARTA, hora: "15:00" } });
      expect([s.status, r.status]).toEqual([404, 404]);
      expect(await env.DB.prepare("SELECT * FROM atendimentos WHERE id = ?").bind(id).first()).toEqual(antes);
    });

    it("bloqueios: período acima de 93 dias dá 400", async () => {
      const ok = await req("/api/bloqueios?de=2026-12-01&ate=2027-03-04", { token: b1.token });
      expect(ok.status).toBe(200);
      const longo = await req("/api/bloqueios?de=2026-12-01&ate=2027-03-05", { token: b1.token });
      expect(longo.status).toBe(400);
      expect(((await longo.json()) as any).erro).toBe("Período muito longo (máximo 93 dias).");
    });

    it("remarcar atendimento já encerrado dá 400", async () => {
      for (const status of ["atendido", "cancelado", "faltou"]) {
        const id = await semearAtendimento(b1.id, QUARTA, 600, { status });
        const r = await req(`/api/atendimentos/${id}/remarcar`, { metodo: "PATCH", token: b1.token, corpo: { data: QUARTA, hora: "15:00" } });
        expect(r.status).toBe(400);
        expect(((await r.json()) as any).erro).toBe("Este atendimento não pode ser remarcado.");
      }
    });

    it("remarcar sobre bloqueio dá 409 com mensagem própria", async () => {
      const id = await semearAtendimento(b1.id, QUARTA, 600);
      await req("/api/bloqueios", { metodo: "POST", token: b1.token, corpo: { data: QUARTA, horaIni: "15:00", horaFim: "16:00" } });
      const r = await req(`/api/atendimentos/${id}/remarcar`, { metodo: "PATCH", token: b1.token, corpo: { data: QUARTA, hora: "15:00" } });
      expect(r.status).toBe(409);
      expect(((await r.json()) as any).erro).toBe("Esse horário está bloqueado.");
    });

    it("marcar na hora do almoço avisa fora_do_expediente", async () => {
      const r = await marcar(b1.token, { hora: "12:00" });
      expect(((await r.json()) as any).avisos).toEqual(["fora_do_expediente"]);
      const borda = await marcar(b1.token, { hora: "11:45" }); // 11:45-12:15 invade o almoço
      expect(((await borda.json()) as any).avisos).toEqual(["fora_do_expediente"]);
      expect((await marcar(b1.token, { hora: "11:30" })).status).toBe(201); // termina às 12:00
    });
  });

  describe("remarcar", () => {
    it("move o atendimento mantendo preço e duração; sobreposição dá 409", async () => {
      const id = await semearAtendimento(b1.id, QUARTA, 600);
      await semearAtendimento(b1.id, QUARTA, 900);
      const ok = await req(`/api/atendimentos/${id}/remarcar`, {
        metodo: "PATCH",
        token: b1.token,
        corpo: { data: QUARTA, hora: "10:15" }, // sobrepõe o próprio horário: permitido
      });
      expect(ok.status).toBe(200);
      const a = await env.DB.prepare("SELECT * FROM atendimentos WHERE id = ?").bind(id).first<any>();
      expect(a.inicio).toBe(instanteUTC(QUARTA, 615).toISOString());
      expect(a.fim).toBe(instanteUTC(QUARTA, 645).toISOString());
      expect(a.preco_centavos).toBe(4000);
      const conf = await req(`/api/atendimentos/${id}/remarcar`, {
        metodo: "PATCH",
        token: b1.token,
        corpo: { data: QUARTA, hora: "15:10" },
      });
      expect(conf.status).toBe(409);
    });

    it("o dono pode passar o atendimento para outro barbeiro", async () => {
      const id = await semearAtendimento(b1.id, QUARTA, 600);
      const r = await req(`/api/atendimentos/${id}/remarcar`, {
        metodo: "PATCH",
        token: dono.token,
        corpo: { data: QUARTA, hora: "10:00", usuarioId: b2.id },
      });
      expect(r.status).toBe(200);
      const a = await env.DB.prepare("SELECT usuario_id FROM atendimentos WHERE id = ?").bind(id).first<any>();
      expect(a.usuario_id).toBe(b2.id);
    });
  });

  describe("marcar na mão", () => {
    it("20:00 fora do expediente: aviso sem gravar; com confirmarAvisos grava", async () => {
      const r = await marcar(b1.token, { hora: "20:00" });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ avisos: ["fora_do_expediente"] });
      expect(await contar("atendimentos")).toBe(0);
      expect(await contar("clientes")).toBe(0);
      const ok = await marcar(b1.token, { hora: "20:00", confirmarAvisos: true });
      expect(ok.status).toBe(201);
      const a = await env.DB.prepare("SELECT * FROM atendimentos").first<any>();
      expect(a.origem).toBe("painel");
      expect(a.status).toBe("marcado");
      expect(a.usuario_id).toBe(b1.id);
      expect(a.inicio).toBe(instanteUTC(QUARTA, 1200).toISOString());
    });

    it("por cima de atendimento ativo: 409 mesmo com confirmarAvisos", async () => {
      await semearAtendimento(b1.id, QUARTA, 600);
      expect((await marcar(b1.token, { hora: "10:15" })).status).toBe(409);
      expect((await marcar(b1.token, { hora: "10:15", confirmarAvisos: true })).status).toBe(409);
      expect(await contar("atendimentos")).toBe(1);
    });

    it("3 semanas à frente: 201, sem regra da semana", async () => {
      const r = await marcar(b1.token, { data: "2026-12-22" });
      expect(r.status).toBe(201);
    });

    it("sem telefone cria clientes separados; com telefone reaproveita e mantém o nome", async () => {
      expect((await marcar(b1.token, { nome: "A" })).status).toBe(201);
      expect((await marcar(b1.token, { nome: "B", hora: "11:00" })).status).toBe(201);
      expect(await contar("clientes")).toBe(2);
      expect((await marcar(b1.token, { nome: "Maria", telefone: "(11) 91234-5678", hora: "14:00" })).status).toBe(201);
      expect((await marcar(b1.token, { nome: "Outra", telefone: "11912345678", hora: "15:00" })).status).toBe(201);
      const c = await env.DB.prepare("SELECT nome FROM clientes WHERE telefone IS NOT NULL").all<any>();
      expect(c.results).toEqual([{ nome: "Maria" }]);
    });

    it("avisa no passado e horário bloqueado; bloqueio confirmado grava", async () => {
      const passado = await marcar(b1.token, { data: "2026-12-01", hora: "09:00" });
      expect(((await passado.json()) as any).avisos).toEqual(["no_passado"]);
      const bl = await req("/api/bloqueios", {
        metodo: "POST",
        token: b1.token,
        corpo: { data: QUARTA, horaIni: "10:00", horaFim: "11:00" },
      });
      expect(bl.status).toBe(201);
      const aviso = await marcar(b1.token, { hora: "10:00" });
      expect(((await aviso.json()) as any).avisos).toEqual(["horario_bloqueado"]);
      expect((await marcar(b1.token, { hora: "10:00", confirmarAvisos: true })).status).toBe(201);
    });

    it("serviço inexistente ou barbeiro inexistente: 400", async () => {
      expect((await marcar(b1.token, { servicos: ["nao-existe"] })).status).toBe(400);
      expect((await marcar(dono.token, { usuarioId: "nao-existe" })).status).toBe(400);
    });
  });

  describe("bloqueios", () => {
    it("o dono fecha 24/12 para a barbearia toda e as vagas somem para todos", async () => {
      vi.setSystemTime(new Date("2026-12-20T02:30:00.000Z"));
      const antes = await vagas(b1.id, "2026-12-24");
      expect(antes.length).toBeGreaterThan(0);
      const r = await req("/api/bloqueios", {
        metodo: "POST",
        token: dono.token,
        corpo: { usuarioId: null, data: "2026-12-24", diaInteiro: true, motivo: "Natal" },
      });
      expect(r.status).toBe(201);
      const b = (await r.json()) as any;
      expect(b.usuario_id).toBeNull();
      expect(b.inicio).toBe(instanteUTC("2026-12-24", 0).toISOString());
      expect(b.fim).toBe(instanteUTC("2026-12-25", 0).toISOString());
      for (const u of [b1, b2, dono]) expect(await vagas(u.id, "2026-12-24")).toEqual([]);
    });

    it("barbeiro: usuarioId null ou de outro dá 403; o próprio vale e horaIni sozinha vai até o fim do dia", async () => {
      const corpo = { data: QUARTA, diaInteiro: true };
      for (const usuarioId of [null, b2.id]) {
        const r = await req("/api/bloqueios", { metodo: "POST", token: b1.token, corpo: { ...corpo, usuarioId } });
        expect(r.status).toBe(403);
      }
      expect(await contar("bloqueios")).toBe(0);
      const r = await req("/api/bloqueios", {
        metodo: "POST",
        token: b1.token,
        corpo: { data: QUARTA, horaIni: "16:00" },
      });
      expect(r.status).toBe(201);
      const b = (await r.json()) as any;
      expect(b.usuario_id).toBe(b1.id);
      expect(b.inicio).toBe(instanteUTC(QUARTA, 960).toISOString());
      expect(b.fim).toBe(instanteUTC("2026-12-03", 0).toISOString());
    });

    it("valida horários", async () => {
      const post = (corpo: unknown) => req("/api/bloqueios", { metodo: "POST", token: b1.token, corpo });
      expect((await post({ data: QUARTA })).status).toBe(400);
      expect((await post({ data: QUARTA, horaIni: "11:00", horaFim: "10:00" })).status).toBe(400);
      expect((await post({ data: "2026-13-40", diaInteiro: true })).status).toBe(400);
    });

    it("lista por período e só o dono apaga bloqueio alheio", async () => {
      const mk = async (token: string, corpo: any) =>
        ((await (await req("/api/bloqueios", { metodo: "POST", token, corpo })).json()) as any).id as string;
      const meu = await mk(b1.token, { data: QUARTA, diaInteiro: true });
      const alheio = await mk(b2.token, { data: QUARTA, diaInteiro: true });
      const loja = await mk(dono.token, { usuarioId: null, data: QUARTA, diaInteiro: true });
      const lista = (await (await req(`/api/bloqueios?de=${QUARTA}&ate=${QUARTA}`, { token: b1.token })).json()) as any;
      expect(lista.bloqueios.map((b: any) => b.id).sort()).toEqual([meu, loja].sort());
      const fora = (await (await req("/api/bloqueios?de=2026-12-10&ate=2026-12-11", { token: dono.token })).json()) as any;
      expect(fora.bloqueios).toEqual([]);
      const todos = (await (await req(`/api/bloqueios?de=${QUARTA}&ate=${QUARTA}`, { token: dono.token })).json()) as any;
      expect(todos.bloqueios).toHaveLength(3);
      expect((await req(`/api/bloqueios/${alheio}`, { metodo: "DELETE", token: b1.token })).status).toBe(404);
      expect((await req(`/api/bloqueios/${loja}`, { metodo: "DELETE", token: b1.token })).status).toBe(404);
      expect((await req(`/api/bloqueios/${meu}`, { metodo: "DELETE", token: b1.token })).status).toBe(200);
      expect((await req(`/api/bloqueios/${alheio}`, { metodo: "DELETE", token: dono.token })).status).toBe(200);
      expect(await contar("bloqueios")).toBe(1);
    });

    it("a agenda traz os bloqueios do barbeiro e da barbearia", async () => {
      await req("/api/bloqueios", { metodo: "POST", token: dono.token, corpo: { usuarioId: null, data: QUARTA, diaInteiro: true } });
      await req("/api/bloqueios", { metodo: "POST", token: b2.token, corpo: { data: QUARTA, diaInteiro: true } });
      const j = (await (await req(`/api/agenda?data=${QUARTA}`, { token: b1.token })).json()) as any;
      expect(j.bloqueios).toHaveLength(1);
    });
  });
});

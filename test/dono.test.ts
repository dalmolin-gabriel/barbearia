import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { instanteUTC } from "../src/shared/tempo";
import { criarUsuario, req } from "./ajuda";

let dono: { id: string; token: string };
let b1: { id: string; token: string };
let b2: { id: string; token: string; usuario: string };
let corte = "";
let ipSeq = 0;
const novoIp = () => `10.2.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;

async function semear() {
  for (const t of ["atendimentos", "clientes", "bloqueios", "expediente", "servicos", "limites", "sessoes", "usuarios"])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  dono = await criarUsuario("dono");
  b1 = await criarUsuario("barbeiro");
  b2 = await criarUsuario("barbeiro");
  for (const u of [dono, b1, b2])
    for (let dia = 0; dia <= 6; dia++)
      await env.DB.prepare(
        "INSERT INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min) VALUES (?, ?, ?, 540, 1140, 720, 780)",
      )
        .bind(u.id, dia, dia >= 1 ? 1 : 0)
        .run();
  corte = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem) VALUES (?, 'Corte', 30, 4000, 1, 0)",
  )
    .bind(corte)
    .run();
}

async function semearAtendimento(
  usuarioId: string,
  inicio: Date,
  extra: { status?: string; preco?: number; clienteId?: string } = {},
) {
  let clienteId = extra.clienteId;
  if (!clienteId) {
    clienteId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO clientes (id, nome, telefone, removido, criado_em) VALUES (?, 'Cliente', ?, 0, 'x')")
      .bind(clienteId, `5511${Math.random().toString().slice(2, 11)}`)
      .run();
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO atendimentos (id, cliente_id, usuario_id, servicos_txt, duracao_min, preco_centavos, inicio, fim, status, origem, criado_em, atualizado_em) VALUES (?, ?, ?, 'Corte', 30, ?, ?, ?, ?, 'painel', 'x', 'x')",
  )
    .bind(
      id,
      clienteId,
      usuarioId,
      extra.preco ?? 4000,
      inicio.toISOString(),
      new Date(inicio.getTime() + 30 * 60_000).toISOString(),
      extra.status ?? "atendido",
    )
    .run();
  return id;
}

const sete = (extra: Record<string, unknown> = {}) =>
  Array.from({ length: 7 }, (_, dia) => ({
    dia_semana: dia,
    aberto: dia >= 1,
    inicio_min: 540,
    fim_min: 1140,
    almoco_ini_min: 720,
    almoco_fim_min: 780,
    ...extra,
  }));

describe("rotas do dono", () => {
  beforeEach(semear);

  it("o barbeiro recebe 403 em toda escrita; sem login, 401", async () => {
    const t = b1.token;
    const chamadas: [string, string, unknown][] = [
      ["POST", "/api/servicos", { nome: "X", duracao_min: 30, preco_centavos: 1000 }],
      ["PUT", `/api/servicos/${corte}`, { nome: "X", duracao_min: 30, preco_centavos: 1000, ativo: true }],
      ["PUT", `/api/expediente/${b1.id}`, { dias: sete() }],
      ["POST", "/api/equipe", { nome: "Novo", usuario: "novo", senha: "12345678" }],
      ["PUT", `/api/equipe/${b2.id}`, { ativo: false }],
      ["DELETE", `/api/clientes/${crypto.randomUUID()}`, undefined],
    ];
    for (const [metodo, caminho, corpo] of chamadas)
      expect((await req(caminho, { metodo, corpo, token: t })).status, `${metodo} ${caminho}`).toBe(403);
    for (const c of ["/api/servicos", "/api/equipe", "/api/resumo?mes=2026-11", "/api/clientes?busca=a"])
      expect((await req(c, { token: t })).status, c).toBe(403);
    expect((await req("/api/servicos")).status).toBe(401);
  });

  describe("serviços", () => {
    it("cria, lista e edita; valida limites", async () => {
      const r = await req("/api/servicos", {
        metodo: "POST",
        token: dono.token,
        corpo: { nome: "Barba", duracao_min: 20, preco_centavos: 3000 },
      });
      expect(r.status).toBe(201);
      const criado = (await r.json()) as any;
      for (const ruim of [
        { nome: "", duracao_min: 30, preco_centavos: 1 },
        { nome: "X", duracao_min: 33, preco_centavos: 1 },
        { nome: "X", duracao_min: 0, preco_centavos: 1 },
        { nome: "X", duracao_min: 485, preco_centavos: 1 },
        { nome: "X", duracao_min: 30, preco_centavos: -1 },
        { nome: "X", duracao_min: 30, preco_centavos: 10_000_001 },
      ])
        expect(
          (await req("/api/servicos", { metodo: "POST", token: dono.token, corpo: ruim })).status,
        ).toBe(400);
      const p = await req(`/api/servicos/${criado.id}`, {
        metodo: "PUT",
        token: dono.token,
        corpo: { nome: "Barba", duracao_min: 25, preco_centavos: 3500, ativo: false },
      });
      expect(p.status).toBe(200);
      const l = (await (await req("/api/servicos", { token: dono.token })).json()) as any;
      expect(l.servicos).toHaveLength(2);
      expect(l.servicos.find((s: any) => s.id === criado.id).ativo).toBe(0);
      expect(
        (await req(`/api/servicos/nao-existe`, { metodo: "PUT", token: dono.token, corpo: { nome: "A", duracao_min: 30, preco_centavos: 1, ativo: true } })).status,
      ).toBe(404);
      expect((await req(`/api/servicos/${criado.id}`, { metodo: "DELETE", token: dono.token })).status).toBe(404);
    });

    it("mudar o preço depois de atendido não altera o resumo", async () => {
      await semearAtendimento(b1.id, instanteUTC("2026-11-10", 600), { preco: 4000 });
      await req(`/api/servicos/${corte}`, {
        metodo: "PUT",
        token: dono.token,
        corpo: { nome: "Corte", duracao_min: 30, preco_centavos: 5000, ativo: true },
      });
      const j = (await (await req("/api/resumo?mes=2026-11", { token: dono.token })).json()) as any;
      expect(j.faturamento_centavos).toBe(4000);
    });
  });

  describe("expediente", () => {
    it("o barbeiro lê o próprio, mas não o de outro; o dono lê qualquer um", async () => {
      expect((await req(`/api/expediente?usuarioId=${b1.id}`, { token: b1.token })).status).toBe(200);
      expect((await req(`/api/expediente?usuarioId=${b2.id}`, { token: b1.token })).status).toBe(403);
      const j = (await (await req(`/api/expediente?usuarioId=${b2.id}`, { token: dono.token })).json()) as any;
      expect(j.dias).toHaveLength(7);
    });

    it("grava os 7 dias e rejeita combinações inválidas", async () => {
      const ok = await req(`/api/expediente/${b1.id}`, {
        metodo: "PUT",
        token: dono.token,
        corpo: { dias: sete({ inicio_min: 600 }) },
      });
      expect(ok.status).toBe(200);
      const l = (await (await req(`/api/expediente?usuarioId=${b1.id}`, { token: b1.token })).json()) as any;
      expect(l.dias[3].inicio_min).toBe(600);
      const put = (dias: unknown) =>
        req(`/api/expediente/${b1.id}`, { metodo: "PUT", token: dono.token, corpo: { dias } });
      expect((await put(sete().slice(0, 6))).status).toBe(400);
      expect((await put(sete({ inicio_min: 1140, fim_min: 540 }))).status).toBe(400);
      expect((await put(sete({ almoco_ini_min: 500, almoco_fim_min: 780 }))).status).toBe(400);
      expect((await put(sete({ almoco_ini_min: 720, almoco_fim_min: null }))).status).toBe(400);
      expect((await put(sete({ almoco_ini_min: null, almoco_fim_min: null }))).status).toBe(200);
      const repetido = sete();
      repetido[6] = { ...repetido[5]! };
      expect((await put(repetido)).status).toBe(400);
      expect(
        (await req(`/api/expediente/${crypto.randomUUID()}`, { metodo: "PUT", token: dono.token, corpo: { dias: sete() } })).status,
      ).toBe(404);
    });
  });

  describe("equipe", () => {
    it("cria barbeiro com expediente padrão, sem expor o hash", async () => {
      const r = await req("/api/equipe", {
        metodo: "POST",
        token: dono.token,
        corpo: { nome: "Novo Barbeiro", usuario: "novo.barbeiro", senha: "12345678" },
      });
      expect(r.status).toBe(201);
      const j = (await r.json()) as any;
      expect(j.senha_hash).toBeUndefined();
      expect(j.papel).toBe("barbeiro");
      const { results } = await env.DB.prepare("SELECT * FROM expediente WHERE usuario_id = ? ORDER BY dia_semana")
        .bind(j.id)
        .all<any>();
      expect(results).toHaveLength(7);
      expect(results[0].aberto).toBe(0);
      expect(results[1]).toMatchObject({ aberto: 1, inicio_min: 540, fim_min: 1140, almoco_ini_min: 720, almoco_fim_min: 780 });
      expect(results[6].aberto).toBe(1);
      const login = await req("/api/auth/entrar", {
        metodo: "POST",
        corpo: { usuario: "novo.barbeiro", senha: "12345678" },
        ip: novoIp(),
      });
      expect(login.status).toBe(200);
      const lista = (await (await req("/api/equipe", { token: dono.token })).json()) as any;
      expect(lista.equipe.length).toBe(4);
      expect(JSON.stringify(lista)).not.toContain("senha_hash");
    });

    it("usuário repetido dá 409; usuário e senha inválidos dão 400", async () => {
      const corpo = { nome: "A", usuario: "repetido", senha: "12345678" };
      expect((await req("/api/equipe", { metodo: "POST", token: dono.token, corpo })).status).toBe(201);
      expect((await req("/api/equipe", { metodo: "POST", token: dono.token, corpo: { ...corpo, usuario: "REPETIDO" } })).status).toBe(409);
      for (const ruim of [{ usuario: "ab" }, { usuario: "com espaço" }, { senha: "1234567" }, { nome: "" }])
        expect((await req("/api/equipe", { metodo: "POST", token: dono.token, corpo: { ...corpo, usuario: "outro", ...ruim } })).status).toBe(400);
    });

    it("desativar derruba a sessão, some da info pública e continua no resumo", async () => {
      await semearAtendimento(b2.id, instanteUTC("2026-11-10", 600));
      const antes = (await (await req("/api/publico/info", { ip: novoIp() })).json()) as any;
      expect(antes.barbeiros.map((b: any) => b.id)).toContain(b2.id);
      const r = await req(`/api/equipe/${b2.id}`, { metodo: "PUT", token: dono.token, corpo: { ativo: false } });
      expect(r.status).toBe(200);
      expect((await req("/api/agenda?data=2026-11-10", { token: b2.token })).status).toBe(401);
      const depois = (await (await req("/api/publico/info", { ip: novoIp() })).json()) as any;
      expect(depois.barbeiros.map((b: any) => b.id)).not.toContain(b2.id);
      const j = (await (await req("/api/resumo?mes=2026-11", { token: dono.token })).json()) as any;
      expect(j.atendidos).toBe(1);
      expect(j.porBarbeiro.find((b: any) => b.id === b2.id)).toMatchObject({ atendidos: 1, faturamento_centavos: 4000 });
    });

    it("trocar a senha derruba a sessão; o dono não se desativa", async () => {
      expect((await req(`/api/equipe/${b1.id}`, { metodo: "PUT", token: dono.token, corpo: { senha: "curta" } })).status).toBe(400);
      expect((await req(`/api/equipe/${b1.id}`, { metodo: "PUT", token: dono.token, corpo: { senha: "nova-senha-123", nome: "Renomeado" } })).status).toBe(200);
      expect((await req("/api/agenda?data=2026-11-10", { token: b1.token })).status).toBe(401);
      expect((await req(`/api/equipe/${dono.id}`, { metodo: "PUT", token: dono.token, corpo: { ativo: false } })).status).toBe(400);
      expect((await req(`/api/equipe/${crypto.randomUUID()}`, { metodo: "PUT", token: dono.token, corpo: { nome: "X" } })).status).toBe(404);
    });
  });

  describe("resumo", () => {
    it("conta o mês no fuso de Brasília e por status", async () => {
      // 23:30 de 30/11 em Brasília já é 01/12 em UTC: fica em novembro.
      await semearAtendimento(b1.id, instanteUTC("2026-11-30", 1410));
      await semearAtendimento(b1.id, instanteUTC("2026-12-01", 0), { preco: 1000 });
      await semearAtendimento(b1.id, instanteUTC("2026-12-05", 600), { status: "faltou" });
      await semearAtendimento(b1.id, instanteUTC("2026-12-06", 600), { status: "cancelado" });
      await semearAtendimento(b1.id, instanteUTC("2026-12-07", 600), { status: "marcado" });
      const nov = (await (await req("/api/resumo?mes=2026-11", { token: dono.token })).json()) as any;
      expect(nov).toMatchObject({ faturamento_centavos: 4000, atendidos: 1, faltas: 0, cancelados: 0 });
      const dez = (await (await req("/api/resumo?mes=2026-12", { token: dono.token })).json()) as any;
      expect(dez).toMatchObject({ faturamento_centavos: 1000, atendidos: 1, faltas: 1, cancelados: 1 });
      expect(dez.porBarbeiro).toHaveLength(3);
      for (const m of ["2026-13", "2026-1", "x", ""])
        expect((await req(`/api/resumo?mes=${m}`, { token: dono.token })).status).toBe(400);
    });
  });

  describe("clientes", () => {
    it("busca por nome (sem curinga) ou telefone e limita a 20", async () => {
      const c1 = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO clientes (id, nome, telefone, removido, criado_em) VALUES (?, 'João Silva', '5548999991234', 0, 'x')").bind(c1).run();
      await env.DB.prepare("INSERT INTO clientes (id, nome, telefone, removido, criado_em) VALUES (?, '100% Maria', NULL, 0, 'x')").bind(crypto.randomUUID()).run();
      await semearAtendimento(b1.id, instanteUTC("2026-11-10", 600), { clienteId: c1 });
      const busca = async (q: string) =>
        ((await (await req(`/api/clientes?busca=${encodeURIComponent(q)}`, { token: dono.token })).json()) as any).clientes;
      expect((await busca("joão"))[0]).toMatchObject({ id: c1, telefone: "(48) 99999-1234" });
      expect((await busca("joão"))[0].ultimo_atendimento).toBe(instanteUTC("2026-11-10", 600).toISOString());
      expect(await busca("(48) 99999-1234")).toHaveLength(1);
      expect(await busca("5548999991234")).toHaveLength(1);
      expect(await busca("%")).toHaveLength(1);
      expect(await busca("_")).toHaveLength(0);
      for (let i = 0; i < 25; i++)
        await env.DB.prepare("INSERT INTO clientes (id, nome, telefone, removido, criado_em) VALUES (?, ?, NULL, 0, 'x')").bind(crypto.randomUUID(), `Zeca ${i}`).run();
      expect(await busca("zeca")).toHaveLength(20);
    });

    it("apagar anonimiza, some da busca e mantém o atendimento", async () => {
      const c1 = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO clientes (id, nome, telefone, aceite_em, removido, criado_em) VALUES (?, 'João Silva', '5548999991234', 'x', 0, 'x')").bind(c1).run();
      const at = await semearAtendimento(b1.id, instanteUTC("2026-12-02", 600), { clienteId: c1, status: "marcado" });
      const r = await req(`/api/clientes/${c1}`, { metodo: "DELETE", token: dono.token });
      expect(r.status).toBe(200);
      const j = (await (await req("/api/clientes?busca=48999991234", { token: dono.token })).json()) as any;
      expect(j.clientes).toHaveLength(0);
      expect(((await (await req("/api/clientes?busca=Cliente removido", { token: dono.token })).json()) as any).clientes).toHaveLength(0);
      const ag = (await (await req("/api/agenda?data=2026-12-02&quem=todos", { token: dono.token })).json()) as any;
      expect(ag.atendimentos.find((a: any) => a.id === at).cliente_nome).toBe("Cliente removido");
      const linha = await env.DB.prepare("SELECT * FROM clientes WHERE id = ?").bind(c1).first<any>();
      expect(linha).toMatchObject({ nome: "Cliente removido", telefone: null, removido: 1, aceite_em: null });
      expect((await req(`/api/clientes/${crypto.randomUUID()}`, { metodo: "DELETE", token: dono.token })).status).toBe(404);
    });
  });
});

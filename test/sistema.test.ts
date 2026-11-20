import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { criarUsuario, req } from "./ajuda";

type Papeis = { dono: Awaited<ReturnType<typeof criarUsuario>>; barbeiro: Awaited<ReturnType<typeof criarUsuario>> };

const TABELAS = [
  "push_inscricoes", "sessoes", "atendimentos", "bloqueios", "clientes", "expediente",
  "tentativas_login", "limites", "usuarios", "servicos",
];

const contar = async (tabela: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).first<{ n: number }>())?.n;

let p: Papeis;

async function semear() {
  for (const t of TABELAS) await env.DB.prepare(`DELETE FROM ${t}`).run();
  p = { dono: await criarUsuario("dono"), barbeiro: await criarUsuario("barbeiro") };
  const agora = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem) VALUES ('s1', 'Corte', 30, 4000, 1, 0)"),
    env.DB.prepare("INSERT INTO clientes (id, nome, telefone, aceite_em, removido, criado_em) VALUES ('c1', 'João', '48999991234', ?1, 0, ?1)").bind(agora),
    env.DB.prepare(
      "INSERT INTO atendimentos (id, cliente_id, usuario_id, servicos_txt, duracao_min, preco_centavos, inicio, fim, status, origem, criado_em, atualizado_em) VALUES ('a1', 'c1', ?1, 'Corte', 30, 4000, ?2, ?2, 'marcado', 'painel', ?2, ?2)",
    ).bind(p.barbeiro.id, agora),
    env.DB.prepare("INSERT INTO bloqueios (id, usuario_id, inicio, fim, motivo, criado_por) VALUES ('b1', NULL, ?1, ?1, 'x', ?2)").bind(agora, p.dono.id),
    env.DB.prepare("INSERT INTO push_inscricoes (id, usuario_id, endpoint, p256dh, auth, criado_em) VALUES ('p1', ?1, 'https://push.exemplo.com/1', 'k', 'a', ?2)").bind(p.dono.id, agora),
    env.DB.prepare("INSERT INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min) VALUES (?1, 1, 1, 540, 1140)").bind(p.dono.id),
    env.DB.prepare("INSERT INTO tentativas_login (usuario, falhas) VALUES ('x@exemplo.com', 2)"),
  ]);
}

const zerar = (token: string | undefined, corpo: unknown) =>
  req("/api/sistema/zerar", { metodo: "POST", token, corpo });

describe("zerar sistema", () => {
  beforeEach(semear);

  it("sem login: 401; barbeiro: 403 e nada é apagado", async () => {
    const corpo = { senha: p.barbeiro.senha, confirmacao: "ZERAR" };
    expect((await zerar(undefined, corpo)).status).toBe(401);
    expect((await zerar(p.barbeiro.token, corpo)).status).toBe(403);
    expect(await contar("usuarios")).toBe(2);
  });

  it("senha errada: 403 'Senha incorreta.' e nada é apagado", async () => {
    const r = await zerar(p.dono.token, { senha: "errada-errada", confirmacao: "ZERAR" });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ erro: "Senha incorreta." });
    expect(await contar("usuarios")).toBe(2);
    expect(await contar("atendimentos")).toBe(1);
  });

  it("sem a confirmação ZERAR (ou diferente): 400", async () => {
    for (const corpo of [{ senha: p.dono.senha }, { senha: p.dono.senha, confirmacao: "zerar" }, { senha: p.dono.senha, confirmacao: "" }, { confirmacao: "ZERAR" }])
      expect((await zerar(p.dono.token, corpo)).status, JSON.stringify(corpo)).toBe(400);
    expect(await contar("usuarios")).toBe(2);
  });

  it("origem de outro site: 403 (CSRF) e nada é apagado", async () => {
    const r = await SELF.fetch("https://exemplo.com/api/sistema/zerar", {
      method: "POST",
      headers: { Origin: "https://malicioso.com", "Content-Type": "application/json", Cookie: `sessao=${p.dono.token}` },
      body: JSON.stringify({ senha: p.dono.senha, confirmacao: "ZERAR" }),
    });
    expect(r.status).toBe(403);
    expect(await contar("usuarios")).toBe(2);
  });

  it("sucesso: 204, esvazia tudo, mantém serviços e config, limpa o cookie e reabre o cadastro", async () => {
    const r = await zerar(p.dono.token, { senha: p.dono.senha, confirmacao: "ZERAR" });
    expect(r.status).toBe(204);
    expect(r.headers.get("Set-Cookie") ?? "").toContain("Max-Age=0");
    for (const t of TABELAS.filter((t) => t !== "servicos")) expect(await contar(t), t).toBe(0);
    expect(await contar("servicos")).toBe(1);
    expect(await contar("config")).toBeGreaterThan(0);
    expect((await req("/api/auth/eu", { token: p.dono.token })).status).toBe(401);
    expect(await (await req("/api/cadastro")).json()).toEqual({ disponivel: true });

    // O dono seguinte cria a conta e os serviços atuais (com preços) continuam.
    const novo = await req("/api/cadastro", {
      metodo: "POST",
      corpo: { nome: "Novo Dono", email: "novo@exemplo.com", senha: "senha-forte-1" },
      ip: "203.0.113.50",
    });
    expect(novo.status).toBe(201);
    const { results } = await env.DB.prepare("SELECT nome, preco_centavos FROM servicos").all();
    expect(results).toEqual([{ nome: "Corte", preco_centavos: 4000 }]);
  });
});

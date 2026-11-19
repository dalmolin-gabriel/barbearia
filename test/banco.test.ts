import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { aplicarMigracoes } from "../src/worker/db/migrar";

const TABELAS = [
  "usuarios",
  "sessoes",
  "tentativas_login",
  "servicos",
  "expediente",
  "bloqueios",
  "clientes",
  "atendimentos",
  "push_inscricoes",
  "limites",
  "config",
];

describe("banco de dados", () => {
  it("cria as 11 tabelas", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all<{ name: string }>();
    const nomes = results.map((r) => r.name);
    for (const tabela of TABELAS) expect(nomes).toContain(tabela);
  });

  it("rejeita atendimento com status inválido", async () => {
    const agora = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO usuarios (id, nome, usuario, senha_hash, papel, criado_em) VALUES ('u1', 'Dono', 'dono', 'x', 'dono', ?)",
      ).bind(agora),
      env.DB.prepare(
        "INSERT INTO clientes (id, nome, telefone, aceite_em, criado_em) VALUES ('c1', 'Cliente', '11999990000', ?, ?)",
      ).bind(agora, agora),
    ]);
    const inserir = env.DB.prepare(
      `INSERT INTO atendimentos (id, cliente_id, usuario_id, servicos_txt, duracao_min, preco_centavos,
         inicio, fim, status, origem, criado_em, atualizado_em)
       VALUES ('a1', 'c1', 'u1', 'Corte', 30, 5000, ?, ?, ?, 'painel', ?, ?)`,
    );
    await expect(inserir.bind(agora, agora, "outro", agora, agora).run()).rejects.toThrow();
  });

  it("tem as configurações iniciais", async () => {
    const { results } = await env.DB.prepare("SELECT chave, valor FROM config").all<{
      chave: string;
      valor: string;
    }>();
    const cfg = Object.fromEntries(results.map((r) => [r.chave, r.valor]));
    expect(cfg.abertura_dia).toBe("6");
    expect(cfg.abertura_minuto).toBe("1380");
    expect(cfg.nome_barbearia).toBe("Barbearia dos Padilhas");
  });
});

describe("aplicarMigracoes", () => {
  it("é idempotente e registra 1 linha em _migracoes", async () => {
    await aplicarMigracoes(env.DB);
    await aplicarMigracoes(env.DB);
    const { results } = await env.DB.prepare("SELECT nome FROM _migracoes").all();
    expect(results).toHaveLength(1);
  });
});

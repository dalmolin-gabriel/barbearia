import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { aplicarMigracoes } from "../src/worker/db/migrar";

it("cria o esquema completo num banco sem tabelas", async () => {
  // O setup já aplicou as migrações; apaga tudo para simular um banco recém-criado.
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  ).all<{ name: string }>();
  await env.DB.exec("PRAGMA foreign_keys = OFF");
  for (const { name } of results) await env.DB.exec(`DROP TABLE IF EXISTS "${name}"`);
  await env.DB.exec("PRAGMA foreign_keys = ON");

  await aplicarMigracoes(env.DB);

  const tabelas = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('usuarios','atendimentos','config','_migracoes')",
  ).all();
  expect(tabelas.results).toHaveLength(4);
  const cfg = await env.DB.prepare("SELECT COUNT(*) AS n FROM config").first<{ n: number }>();
  expect(cfg?.n).toBe(5);
  const m = await env.DB.prepare("SELECT COUNT(*) AS n FROM _migracoes").first<{ n: number }>();
  expect(m?.n).toBe(2);
});

it("aplicar as migrações duas vezes (inclusive após o applyD1Migrations) não falha", async () => {
  await aplicarMigracoes(env.DB);
  await aplicarMigracoes(env.DB);
  const colunas = await env.DB.prepare("SELECT name FROM pragma_table_info('atendimentos')").all<{ name: string }>();
  expect(colunas.results.filter((c) => c.name === "token_cliente_hash")).toHaveLength(1);
});

it("registra a migração quando a coluna já existe (aplicada por outro caminho)", async () => {
  await env.DB.prepare("DELETE FROM _migracoes WHERE nome = '0002_token_cliente.sql'").run();
  await aplicarMigracoes(env.DB);
  const m = await env.DB.prepare("SELECT COUNT(*) AS n FROM _migracoes").first<{ n: number }>();
  expect(m?.n).toBe(2);
});

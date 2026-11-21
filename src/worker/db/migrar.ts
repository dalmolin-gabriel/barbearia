// Aplica sozinho as migrações de ./migrations. O dono publica só pelo painel da
// Cloudflare e não roda `wrangler d1 migrations apply`, então o banco novo precisa
// ficar pronto no primeiro acesso. Os arquivos .sql entram no bundle via `?raw`.
import inicial from "../../../migrations/0001_inicial.sql?raw";
import tokenCliente from "../../../migrations/0002_token_cliente.sql?raw";
import semanasAbertas from "../../../migrations/0003_semanas_abertas.sql?raw";
import recuperacao from "../../../migrations/0004_recuperacao.sql?raw";

// Em ordem de nome de arquivo. Nova migração: importe e acrescente ao fim da lista.
// `jaAplicada` é para migração que não é idempotente (ALTER TABLE ADD COLUMN): se o efeito já
// existe no banco (aplicada por outro caminho, como o applyD1Migrations dos testes), só registra.
type Migracao = { nome: string; sql: string; jaAplicada?: (db: D1Database) => Promise<boolean> };

const temColuna = async (db: D1Database, tabela: string, coluna: string) => {
  const { results } = await db.prepare(`SELECT name FROM pragma_table_info('${tabela}')`).all<{ name: string }>();
  return results.some((r) => r.name === coluna);
};

const MIGRACOES: Migracao[] = [
  { nome: "0001_inicial.sql", sql: inicial },
  {
    nome: "0002_token_cliente.sql",
    sql: tokenCliente,
    jaAplicada: (db) => temColuna(db, "atendimentos", "token_cliente_hash"),
  },
  // Só um INSERT OR IGNORE: pode rodar de novo sem efeito, então não precisa de `jaAplicada`.
  { nome: "0003_semanas_abertas.sql", sql: semanasAbertas },
  {
    nome: "0004_recuperacao.sql",
    sql: recuperacao,
    jaAplicada: (db) => temColuna(db, "usuarios", "recuperacao_hash"),
  },
];

// Separa o arquivo em comandos: tira comentários de linha e corta em ";".
// Vale para os nossos arquivos (sem triggers nem ";" dentro de textos).
function comandos(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

export async function aplicarMigracoes(db: D1Database): Promise<void> {
  await db
    .prepare("CREATE TABLE IF NOT EXISTS _migracoes (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)")
    .run();
  const { results } = await db.prepare("SELECT nome FROM _migracoes").all<{ nome: string }>();
  const aplicadas = new Set(results.map((r) => r.nome));

  for (const migracao of MIGRACOES) {
    if (aplicadas.has(migracao.nome)) continue;
    if (migracao.jaAplicada && (await migracao.jaAplicada(db))) {
      // A coluna existe mas o índice pode faltar; o CREATE INDEX IF NOT EXISTS é seguro de repetir.
      await db.batch([
        ...comandos(migracao.sql).filter((c) => !/^ALTER\b/i.test(c)).map((c) => db.prepare(c)),
        db
          .prepare("INSERT OR IGNORE INTO _migracoes (nome, aplicada_em) VALUES (?, ?)")
          .bind(migracao.nome, new Date().toISOString()),
      ]);
      continue;
    }
    // db.batch roda numa transação: ou aplica a migração inteira e registra, ou nada.
    await db.batch([
      ...comandos(migracao.sql).map((c) => db.prepare(c)),
      db
        .prepare("INSERT OR IGNORE INTO _migracoes (nome, aplicada_em) VALUES (?, ?)")
        .bind(migracao.nome, new Date().toISOString()),
    ]);
  }
}

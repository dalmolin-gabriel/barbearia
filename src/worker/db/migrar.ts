// Aplica sozinho as migrações de ./migrations. O dono publica só pelo painel da
// Cloudflare e não roda `wrangler d1 migrations apply`, então o banco novo precisa
// ficar pronto no primeiro acesso. Os arquivos .sql entram no bundle via `?raw`.
import inicial from "../../../migrations/0001_inicial.sql?raw";

// Em ordem de nome de arquivo. Nova migração: importe e acrescente ao fim da lista.
const MIGRACOES: { nome: string; sql: string }[] = [{ nome: "0001_inicial.sql", sql: inicial }];

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
    // db.batch roda numa transação: ou aplica a migração inteira e registra, ou nada.
    await db.batch([
      ...comandos(migracao.sql).map((c) => db.prepare(c)),
      db
        .prepare("INSERT OR IGNORE INTO _migracoes (nome, aplicada_em) VALUES (?, ?)")
        .bind(migracao.nome, new Date().toISOString()),
    ]);
  }
}

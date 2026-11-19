/**
 * Conta uma requisição para a `chave` e diz se ainda cabe no limite (`maximo` por janela de
 * `janelaSeg` segundos). Um único INSERT … ON CONFLICT atômico: chamadas paralelas não passam
 * do máximo, e janela vencida recomeça a contagem em 1.
 */
export async function consumirLimite(
  db: D1Database,
  chave: string,
  maximo: number,
  janelaSeg: number,
): Promise<boolean> {
  const agora = new Date();
  const agoraIso = agora.toISOString();
  const limiteIso = new Date(agora.getTime() - janelaSeg * 1000).toISOString();
  const linha = await db
    .prepare(
      `INSERT INTO limites (chave, janela_inicio, contador) VALUES (?1, ?2, 1)
       ON CONFLICT (chave) DO UPDATE SET
         janela_inicio = CASE WHEN janela_inicio <= ?3 THEN ?2 ELSE janela_inicio END,
         contador = CASE WHEN janela_inicio <= ?3 THEN 1 ELSE contador + 1 END
       RETURNING contador`,
    )
    .bind(chave, agoraIso, limiteIso)
    .first<{ contador: number }>();
  return !!linha && linha.contador <= maximo;
}

/**
 * Comandos que gravam o expediente padrão de um profissional novo: seg a sáb, 9h às 19h,
 * almoço 12h às 13h; domingo fechado. Cada linha só entra se o usuário existir, então dá para
 * usar dentro de um `db.batch` cujo primeiro comando cria o usuário de forma condicional.
 */
export function comandosExpedientePadrao(db: D1Database, usuarioId: string): D1PreparedStatement[] {
  return Array.from({ length: 7 }, (_, dia) =>
    db
      .prepare(
        `INSERT INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min)
         SELECT ?1, ?2, ?3, 540, 1140, 720, 780 WHERE EXISTS (SELECT 1 FROM usuarios WHERE id = ?1)`,
      )
      .bind(usuarioId, dia, dia >= 1 ? 1 : 0),
  );
}

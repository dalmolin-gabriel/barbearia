// Clientes (só o dono): busca e remoção por anonimização (LGPD). Os atendimentos continuam
// no histórico, mas passam a apontar para "Cliente removido", sem telefone.

import { Hono } from "hono";
import { formatarTelefone, normalizarTelefone } from "../../shared/telefone";
import type { AppEnv } from "../env";
import { exigirDono, exigirLogin } from "../seguranca/middleware";

export const clientes = new Hono<AppEnv>();
clientes.use("*", exigirLogin(), exigirDono());

const escaparLike = (t: string) => t.replace(/[\\%_]/g, "\\$&");

clientes.get("/", async (c) => {
  const busca = (c.req.query("busca") ?? "").trim().slice(0, 60);
  if (!busca) return c.json({ clientes: [] });
  const digitos = busca.replace(/\D/g, "");
  // Telefone: o número completo normalizado, ou pelo menos 3 dígitos soltos.
  const fone = normalizarTelefone(busca) ?? (digitos.length >= 3 ? digitos : null);
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.nome, c.telefone,
            (SELECT MAX(a.inicio) FROM atendimentos a WHERE a.cliente_id = c.id) AS ultimo_atendimento
       FROM clientes c
      WHERE c.removido = 0
        AND (c.nome LIKE ?1 ESCAPE '\\' OR (?2 IS NOT NULL AND c.telefone LIKE ?2 ESCAPE '\\'))
      ORDER BY c.nome, c.id
      LIMIT 20`,
  )
    .bind(`%${escaparLike(busca)}%`, fone === null ? null : `%${escaparLike(fone)}%`)
    .all<{ id: string; nome: string; telefone: string | null; ultimo_atendimento: string | null }>();
  return c.json({
    clientes: results.map((r) => ({ ...r, telefone: r.telefone === null ? null : formatarTelefone(r.telefone) })),
  });
});

clientes.delete("/:id", async (c) => {
  const r = await c.env.DB.prepare(
    "UPDATE clientes SET nome = 'Cliente removido', telefone = NULL, removido = 1, aceite_em = NULL WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .run();
  if (r.meta.changes !== 1) return c.json({ erro: "Cliente não encontrado." }, 404);
  return c.json({ ok: true });
});

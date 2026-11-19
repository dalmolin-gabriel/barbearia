// Expediente semanal de cada barbeiro. O dono lê e grava o de qualquer um; o barbeiro só lê o próprio.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Expediente } from "../../shared/tipos";
import type { AppEnv } from "../env";
import { exigirDono, exigirLogin, podeVerAgenda } from "../seguranca/middleware";

export const expediente = new Hono<AppEnv>();
expediente.use("*", exigirLogin());

const minuto = z.number().int().min(0).max(1440);
const dia = z.object({
  dia_semana: z.number().int().min(0).max(6),
  aberto: z.boolean(),
  inicio_min: minuto,
  fim_min: minuto,
  almoco_ini_min: minuto.nullable(),
  almoco_fim_min: minuto.nullable(),
});

const corpo = z.object({ dias: z.array(dia).length(7) });

/** Início antes do fim; almoço (se houver) com os dois limites e dentro do expediente. */
function diaCoerente(d: z.infer<typeof dia>): boolean {
  if (d.inicio_min >= d.fim_min) return false;
  const { almoco_ini_min: ai, almoco_fim_min: af } = d;
  if (ai === null && af === null) return true;
  if (ai === null || af === null) return false;
  return ai < af && ai >= d.inicio_min && af <= d.fim_min;
}

expediente.get("/", async (c) => {
  const alvo = c.req.query("usuarioId") ?? c.var.usuario.id;
  if (!podeVerAgenda(c.var.usuario, alvo)) return c.json({ erro: "Sem permissão para esta ação." }, 403);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM expediente WHERE usuario_id = ? ORDER BY dia_semana",
  )
    .bind(alvo)
    .all<Expediente>();
  return c.json({ dias: results });
});

expediente.put(
  "/:usuarioId",
  exigirDono(),
  bodyLimit({
    maxSize: 8 * 1024,
    onError: (c) => c.json({ erro: "Requisição muito grande." }, 413),
  }),
  async (c) => {
    const analise = corpo.safeParse(await c.req.json().catch(() => null));
    if (!analise.success) return c.json({ erro: "Dados inválidos." }, 400);
    const { dias } = analise.data;
    // Exatamente um registro para cada dia da semana (0 a 6).
    if (new Set(dias.map((d) => d.dia_semana)).size !== 7 || !dias.every(diaCoerente))
      return c.json({ erro: "Dados inválidos." }, 400);
    const db = c.env.DB;
    const id = c.req.param("usuarioId");
    if (!(await db.prepare("SELECT 1 FROM usuarios WHERE id = ?").bind(id).first()))
      return c.json({ erro: "Usuário não encontrado." }, 404);
    // Um batch roda numa transação só: ou grava os 7 dias, ou nenhum.
    await db.batch(
      dias.map((d) =>
        db
          .prepare(
            "INSERT OR REPLACE INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(id, d.dia_semana, d.aberto ? 1 : 0, d.inicio_min, d.fim_min, d.almoco_ini_min, d.almoco_fim_min),
      ),
    );
    return c.json({ ok: true });
  },
);

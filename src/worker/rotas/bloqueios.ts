// Bloqueios de agenda: folga de um barbeiro ou fechamento da barbearia toda (usuario_id NULL).
// Só o dono mexe em bloqueio de outro barbeiro ou da barbearia; o barbeiro só no próprio.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { dataValida, instanteUTC, somarDias } from "../../shared/tempo";
import type { Bloqueio } from "../../shared/tipos";
import type { AppEnv } from "../env";
import { exigirLogin } from "../seguranca/middleware";

export const bloqueios = new Hono<AppEnv>();
bloqueios.use("*", exigirLogin());

const dataSchema = z.string().refine(dataValida);
const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const minutosDe = (hora: string) => {
  const [h = 0, m = 0] = hora.split(":").map(Number);
  return h * 60 + m;
};

const corpo = z.object({
  usuarioId: z.string().min(1).max(64).nullable().optional(),
  data: dataSchema,
  horaIni: horaSchema.optional(),
  horaFim: horaSchema.optional(),
  diaInteiro: z.boolean().optional(),
  motivo: z.string().trim().max(120).optional(),
});

bloqueios.post(
  "/",
  bodyLimit({
    maxSize: 8 * 1024,
    onError: (c) => c.json({ erro: "Requisição muito grande." }, 413),
  }),
  async (c) => {
    const analise = corpo.safeParse(await c.req.json().catch(() => null));
    if (!analise.success) return c.json({ erro: "Dados inválidos." }, 400);
    const d = analise.data;
    const u = c.var.usuario;
    const db = c.env.DB;

    // Sem usuarioId = o próprio. null (barbearia toda) ou outro barbeiro: só o dono.
    const alvo = d.usuarioId === undefined ? u.id : d.usuarioId;
    if (u.papel !== "dono" && alvo !== u.id)
      return c.json({ erro: "Sem permissão para esta ação." }, 403);
    if (
      alvo !== null &&
      !(await db
        .prepare("SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1")
        .bind(alvo)
        .first())
    )
      return c.json({ erro: "Dados inválidos." }, 400);

    // Dia inteiro = 00:00 a 24:00 locais; só horaIni = dali até o fim do dia.
    let ini: number;
    let fim: number;
    if (d.diaInteiro) {
      ini = 0;
      fim = 1440;
    } else if (d.horaIni) {
      ini = minutosDe(d.horaIni);
      fim = d.horaFim ? minutosDe(d.horaFim) : 1440;
      if (fim <= ini) return c.json({ erro: "Dados inválidos." }, 400);
    } else {
      return c.json({ erro: "Informe o horário ou o dia inteiro." }, 400);
    }

    const bloqueio: Bloqueio = {
      id: crypto.randomUUID(),
      usuario_id: alvo,
      inicio: instanteUTC(d.data, ini).toISOString(),
      fim: instanteUTC(d.data, fim).toISOString(),
      motivo: d.motivo ?? "",
      criado_por: u.id,
    };
    await db
      .prepare(
        "INSERT INTO bloqueios (id, usuario_id, inicio, fim, motivo, criado_por) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        bloqueio.id,
        bloqueio.usuario_id,
        bloqueio.inicio,
        bloqueio.fim,
        bloqueio.motivo,
        bloqueio.criado_por,
      )
      .run();
    return c.json(bloqueio, 201);
  },
);

bloqueios.get("/", async (c) => {
  const analise = z
    .object({ de: dataSchema, ate: dataSchema })
    .safeParse(c.req.query());
  if (!analise.success) return c.json({ erro: "Dados inválidos." }, 400);
  const { de, ate } = analise.data;
  if (ate < de) return c.json({ erro: "Dados inválidos." }, 400);
  const u = c.var.usuario;
  const ini = instanteUTC(de, 0).toISOString();
  const fim = instanteUTC(somarDias(ate, 1), 0).toISOString();
  // O barbeiro vê os próprios e os da barbearia toda (que também o afetam); o dono vê todos.
  const dono = u.papel === "dono";
  const stmt = c.env.DB.prepare(
    `SELECT * FROM bloqueios WHERE inicio < ?2 AND fim > ?1${dono ? "" : " AND (usuario_id = ?3 OR usuario_id IS NULL)"} ORDER BY inicio, id`,
  );
  const { results } = await (dono ? stmt.bind(ini, fim) : stmt.bind(ini, fim, u.id)).all<Bloqueio>();
  return c.json({ bloqueios: results });
});

bloqueios.delete("/:id", async (c) => {
  const u = c.var.usuario;
  const dono = u.papel === "dono";
  const stmt = c.env.DB.prepare(
    `DELETE FROM bloqueios WHERE id = ?1${dono ? "" : " AND usuario_id = ?2"}`,
  );
  const r = await (dono ? stmt.bind(c.req.param("id")) : stmt.bind(c.req.param("id"), u.id)).run();
  if (r.meta.changes !== 1) return c.json({ erro: "Bloqueio não encontrado." }, 404);
  return c.json({ ok: true });
});

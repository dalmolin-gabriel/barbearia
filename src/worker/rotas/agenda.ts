// API do painel: agenda do dia, detalhe do atendimento, mudança de situação, remarcação e marcação
// manual. Toda rota exige login. O barbeiro (não dono) só enxerga e mexe na própria agenda: o
// atendimento de outro barbeiro responde 404, como se não existisse.

import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Atendimento } from "../../shared/tipos";
import {
  dataValida,
  diaSemanaDe,
  instanteUTC,
  partesLocais,
  somarDias,
} from "../../shared/tempo";
import { normalizarTelefone } from "../../shared/telefone";
import { buscarServicos, inserirSemConflito } from "../db/consultas";
import type { AppEnv } from "../env";
import { exigirLogin, podeVerAgenda } from "../seguranca/middleware";

export const agenda = new Hono<AppEnv>();
export const atendimentos = new Hono<AppEnv>();
agenda.use("*", exigirLogin());
atendimentos.use("*", exigirLogin());

const limiteCorpo = bodyLimit({
  maxSize: 8 * 1024,
  onError: (c) => c.json({ erro: "Requisição muito grande." }, 413),
});

const MSG_INVALIDO = "Dados inválidos.";
const MSG_PROIBIDO = "Sem permissão para esta ação.";
const MSG_CONFLITO = "Esse horário já está ocupado.";
const NAO_ENCONTRADO = "Atendimento não encontrado.";

const SITUACOES = [
  "marcado",
  "confirmado",
  "atendido",
  "cancelado",
  "faltou",
] as const;

const ehDono = (c: Context<AppEnv>) => c.var.usuario.papel === "dono";

const SELECT_ATENDIMENTO = `SELECT a.id, a.cliente_id, a.usuario_id, a.servicos_txt, a.duracao_min, a.preco_centavos, a.inicio, a.fim, a.status, a.origem, a.criado_em, a.atualizado_em, c.nome AS cliente_nome, c.telefone AS cliente_telefone, u.nome AS barbeiro_nome
  FROM atendimentos a
  JOIN clientes c ON c.id = a.cliente_id
  JOIN usuarios u ON u.id = a.usuario_id`;

const dataSchema = z.string().refine(dataValida);
const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const minutosDe = (hora: string) => {
  const [h = 0, m = 0] = hora.split(":").map(Number);
  return h * 60 + m;
};

/** Atendimento visível ao usuário: o dono vê todos; o barbeiro só os da própria agenda. */
function buscarAtendimento(c: Context<AppEnv>, id: string) {
  const u = c.var.usuario;
  const filtro = ehDono(c) ? "" : " AND a.usuario_id = ?2";
  const stmt = c.env.DB.prepare(`${SELECT_ATENDIMENTO} WHERE a.id = ?1${filtro}`);
  return (ehDono(c) ? stmt.bind(id) : stmt.bind(id, u.id)).first<Atendimento>();
}

const barbeiroAtivo = (db: D1Database, id: string) =>
  db
    .prepare("SELECT id FROM usuarios WHERE id = ? AND ativo = 1")
    .bind(id)
    .first<{ id: string }>();

// ---------- Agenda do dia ----------

agenda.get("/", async (c) => {
  const analise = z
    .object({
      data: dataSchema,
      quem: z.enum(["meus", "todos"]).default("meus"),
    })
    .safeParse(c.req.query());
  if (!analise.success) return c.json({ erro: MSG_INVALIDO }, 400);
  const { data, quem } = analise.data;
  const u = c.var.usuario;
  const todos = ehDono(c) && quem === "todos";
  const ini = instanteUTC(data, 0).toISOString();
  const fim = instanteUTC(somarDias(data, 1), 0).toISOString();
  const db = c.env.DB;

  const filtroAtend = todos ? "" : " AND a.usuario_id = ?3";
  const filtroBloq = todos ? "" : " AND (b.usuario_id = ?3 OR b.usuario_id IS NULL)";
  const extra = todos ? [] : [u.id];
  const [a, b] = await Promise.all([
    db
      .prepare(
        `${SELECT_ATENDIMENTO} WHERE a.inicio >= ?1 AND a.inicio < ?2${filtroAtend} ORDER BY a.inicio, a.id`,
      )
      .bind(ini, fim, ...extra)
      .all<Atendimento>(),
    db
      .prepare(
        `SELECT b.* FROM bloqueios b WHERE b.inicio < ?2 AND b.fim > ?1${filtroBloq} ORDER BY b.inicio, b.id`,
      )
      .bind(ini, fim, ...extra)
      .all(),
  ]);
  return c.json({ data, atendimentos: a.results, bloqueios: b.results });
});

// ---------- Atendimento ----------

atendimentos.get("/:id", async (c) => {
  const a = await buscarAtendimento(c, c.req.param("id"));
  if (!a) return c.json({ erro: NAO_ENCONTRADO }, 404);
  return c.json(a);
});

const ATIVOS = "('marcado', 'confirmado')";

atendimentos.patch("/:id/situacao", limiteCorpo, async (c) => {
  const analise = z
    .object({ situacao: z.enum(SITUACOES) })
    .safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: MSG_INVALIDO }, 400);
  const { situacao } = analise.data;
  const id = c.req.param("id");
  const a = await buscarAtendimento(c, id);
  if (!a) return c.json({ erro: NAO_ENCONTRADO }, 404);
  // "Chegou" e "Faltou" só valem no dia do atendimento (Brasília) ou depois; confirmar/cancelar/reabrir, em qualquer dia.
  if (
    (situacao === "atendido" || situacao === "faltou") &&
    partesLocais(new Date(a.inicio)).data > partesLocais(new Date()).data
  )
    return c.json({ erro: 'Só dá para marcar "Chegou" ou "Faltou" no dia do atendimento.' }, 400);
  // Reabrir (voltar a marcado/confirmado) não pode sobrepor outro atendimento ativo: checa no mesmo UPDATE.
  const ativa = situacao === "marcado" || situacao === "confirmado" ? 1 : 0;
  const r = await c.env.DB.prepare(
    `UPDATE atendimentos SET status = ?2, atualizado_em = ?3
       WHERE id = ?1 AND (?5 = 1 OR usuario_id = ?6) AND (?4 = 0 OR NOT EXISTS (
         SELECT 1 FROM atendimentos o
           WHERE o.id <> atendimentos.id AND o.usuario_id = atendimentos.usuario_id
             AND o.status IN ${ATIVOS} AND o.inicio < atendimentos.fim AND o.fim > atendimentos.inicio
       ))`,
  )
    .bind(id, situacao, new Date().toISOString(), ativa, ehDono(c) ? 1 : 0, c.var.usuario.id)
    .run();
  if (r.meta.changes !== 1) {
    // Não gravou: sumiu/mudou de dono (404) ou o horário reaberto está ocupado (409).
    if (!(await buscarAtendimento(c, id)))
      return c.json({ erro: NAO_ENCONTRADO }, 404);
    return c.json({ erro: MSG_CONFLITO }, 409);
  }
  const atual = await buscarAtendimento(c, id);
  if (!atual) return c.json({ erro: NAO_ENCONTRADO }, 404);
  return c.json(atual);
});

atendimentos.patch("/:id/remarcar", limiteCorpo, async (c) => {
  const analise = z
    .object({
      data: dataSchema,
      hora: horaSchema,
      usuarioId: z.string().min(1).max(64).optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: MSG_INVALIDO }, 400);
  const d = analise.data;
  const id = c.req.param("id");
  const a = await buscarAtendimento(c, id);
  if (!a) return c.json({ erro: NAO_ENCONTRADO }, 404);
  if (a.status !== "marcado" && a.status !== "confirmado")
    return c.json({ erro: "Este atendimento não pode ser remarcado." }, 400);
  const alvo = d.usuarioId ?? a.usuario_id;
  if (!podeVerAgenda(c.var.usuario, alvo))
    return c.json({ erro: MSG_PROIBIDO }, 403);
  if (!(await barbeiroAtivo(c.env.DB, alvo)))
    return c.json({ erro: MSG_INVALIDO }, 400);

  const minuto = minutosDe(d.hora);
  const inicio = instanteUTC(d.data, minuto).toISOString();
  const fim = instanteUTC(d.data, minuto + a.duracao_min).toISOString();
  // Mesma proteção da marcação: sem outro atendimento ativo nem bloqueio no horário (o próprio fica de fora).
  const r = await c.env.DB.prepare(
    `UPDATE atendimentos SET usuario_id = ?2, inicio = ?3, fim = ?4, atualizado_em = ?5
       WHERE id = ?1 AND status IN ${ATIVOS} AND (?6 = 1 OR usuario_id = ?7)
         AND NOT EXISTS (
           SELECT 1 FROM atendimentos o
             WHERE o.id <> ?1 AND o.usuario_id = ?2 AND o.status IN ${ATIVOS} AND o.inicio < ?4 AND o.fim > ?3
         )
         AND NOT EXISTS (
           SELECT 1 FROM bloqueios WHERE (usuario_id = ?2 OR usuario_id IS NULL) AND inicio < ?4 AND fim > ?3
         )`,
  )
    .bind(id, alvo, inicio, fim, new Date().toISOString(), ehDono(c) ? 1 : 0, c.var.usuario.id)
    .run();
  if (r.meta.changes !== 1) {
    const atual = await buscarAtendimento(c, id);
    if (!atual) return c.json({ erro: NAO_ENCONTRADO }, 404);
    if (atual.status !== "marcado" && atual.status !== "confirmado")
      return c.json({ erro: "Este atendimento não pode ser remarcado." }, 400);
    const bloq = await c.env.DB.prepare(
      "SELECT 1 FROM bloqueios WHERE (usuario_id = ?1 OR usuario_id IS NULL) AND inicio < ?3 AND fim > ?2",
    )
      .bind(alvo, inicio, fim)
      .first();
    return c.json(
      { erro: bloq ? "Esse horário está bloqueado." : MSG_CONFLITO },
      409,
    );
  }
  const atual = await buscarAtendimento(c, id);
  if (!atual) return c.json({ erro: NAO_ENCONTRADO }, 404);
  return c.json(atual);
});

const corpoMarcar = z.object({
  nome: z.string().trim().min(1).max(60),
  telefone: z.string().max(30).optional(),
  servicos: z.array(z.string().min(1).max(64)).min(1).max(10),
  usuarioId: z.string().min(1).max(64).optional(),
  data: dataSchema,
  hora: horaSchema,
  confirmarAvisos: z.boolean().optional(),
});

type Aviso = "fora_do_expediente" | "horario_bloqueado" | "no_passado";

atendimentos.post("/", limiteCorpo, async (c) => {
  const analise = corpoMarcar.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: MSG_INVALIDO }, 400);
  const d = analise.data;
  const db = c.env.DB;
  const u = c.var.usuario;

  const alvo = d.usuarioId ?? u.id;
  if (!podeVerAgenda(u, alvo)) return c.json({ erro: MSG_PROIBIDO }, 403);
  let telefone: string | null = null;
  if (d.telefone?.trim()) {
    telefone = normalizarTelefone(d.telefone);
    if (!telefone)
      return c.json({ erro: "Informe um celular com DDD válido." }, 400);
  }
  const [dono, servicos] = await Promise.all([
    barbeiroAtivo(db, alvo),
    buscarServicos(db, d.servicos),
  ]);
  if (!dono || !servicos) return c.json({ erro: MSG_INVALIDO }, 400);

  const duracao = servicos.reduce((s, x) => s + x.duracao_min, 0);
  const preco = servicos.reduce((s, x) => s + x.preco_centavos, 0);
  const minuto = minutosDe(d.hora);
  const inicio = instanteUTC(d.data, minuto).toISOString();
  const fim = instanteUTC(d.data, minuto + duracao).toISOString();
  const agora = new Date();
  const agoraIso = agora.toISOString();

  // Avisos: a equipe pode passar por cima deles, mas só depois de ver.
  const avisos: Aviso[] = [];
  const exp = await db
    .prepare(
      "SELECT aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min FROM expediente WHERE usuario_id = ? AND dia_semana = ?",
    )
    .bind(alvo, diaSemanaDe(d.data))
    .first<{
      aberto: number;
      inicio_min: number;
      fim_min: number;
      almoco_ini_min: number | null;
      almoco_fim_min: number | null;
    }>();
  if (
    !exp ||
    exp.aberto !== 1 ||
    minuto < exp.inicio_min ||
    minuto + duracao > exp.fim_min ||
    (exp.almoco_ini_min !== null &&
      exp.almoco_fim_min !== null &&
      minuto < exp.almoco_fim_min &&
      minuto + duracao > exp.almoco_ini_min)
  )
    avisos.push("fora_do_expediente");
  const bloqueado = await db
    .prepare(
      "SELECT 1 FROM bloqueios WHERE (usuario_id = ?1 OR usuario_id IS NULL) AND inicio < ?3 AND fim > ?2",
    )
    .bind(alvo, inicio, fim)
    .first();
  if (bloqueado) avisos.push("horario_bloqueado");
  if (inicio < agoraIso) avisos.push("no_passado");
  if (avisos.length > 0 && d.confirmarAvisos !== true)
    return c.json({ avisos });

  // Sobreposição com atendimento ativo nunca passa, nem confirmada.
  const tomado = await db
    .prepare(
      `SELECT 1 FROM atendimentos WHERE usuario_id = ? AND status IN ${ATIVOS} AND inicio < ? AND fim > ?`,
    )
    .bind(alvo, fim, inicio)
    .first();
  if (tomado) return c.json({ erro: MSG_CONFLITO }, 409);

  // Cliente: com telefone, upsert pelo normalizado mantendo o nome já gravado (removido é reativado);
  // sem telefone, um cliente novo.
  const clienteId = crypto.randomUUID();
  const cliente = telefone
    ? await db
        .prepare(
          `INSERT INTO clientes (id, nome, telefone, removido, criado_em) VALUES (?1, ?2, ?3, 0, ?4)
           ON CONFLICT (telefone) DO UPDATE SET
             nome = CASE WHEN clientes.removido = 1 THEN excluded.nome ELSE clientes.nome END,
             removido = 0
           RETURNING id`,
        )
        .bind(clienteId, d.nome, telefone, agoraIso)
        .first<{ id: string }>()
    : await db
        .prepare(
          "INSERT INTO clientes (id, nome, telefone, removido, criado_em) VALUES (?1, ?2, NULL, 0, ?3) RETURNING id",
        )
        .bind(clienteId, d.nome, agoraIso)
        .first<{ id: string }>();
  if (!cliente) return c.json({ erro: "Não foi possível marcar." }, 500);

  const id = crypto.randomUUID();
  const gravou = await inserirSemConflito(db, {
    id,
    clienteId: cliente.id,
    usuarioId: alvo,
    servicosTxt: servicos.map((s) => s.nome).join(" + "),
    duracaoMin: duracao,
    precoCentavos: preco,
    inicio,
    fim,
    origem: "painel",
    agora: agoraIso,
    // Só ignora bloqueio quando a equipe viu e confirmou o aviso.
    ignorarBloqueios: avisos.includes("horario_bloqueado"),
  });
  if (!gravou) return c.json({ erro: MSG_CONFLITO }, 409);
  const criado = await buscarAtendimento(c, id);
  if (!criado) return c.json({ erro: NAO_ENCONTRADO }, 404);
  return c.json(criado, 201);
});

// API pública (sem login): o cliente marca horário com nome + celular. É a superfície mais
// exposta do sistema: limite por IP, anti-robô, validação estrita e gravação atômica.

import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { hhmm, instanteUTC } from "../../shared/tempo";
import { normalizarTelefone } from "../../shared/telefone";
import {
  buscarServicos,
  type ServicoLinha,
  contarFuturosDoCliente,
  diasAbertos,
  horariosLivres,
  inserirSemConflito,
} from "../db/consultas";
import type { AppEnv } from "../env";
import { notificarNovoAgendamento } from "../push/notificar";
import { consumirLimite } from "../seguranca/limite";
import { validarTurnstile } from "../seguranca/turnstile";

export const publico = new Hono<AppEnv>();

const MSG_CONFLITO = "Esse horário acabou de ser reservado. Escolha outro.";
const MSG_LIMITE_CELULAR =
  "Você já tem 2 horários marcados. Para marcar outro, fale com a barbearia.";
const MSG_INVALIDO = "Dados inválidos.";
const MAX_SERVICOS = 10;
const MAX_FUTUROS = 2;

const ipDe = (c: Context<AppEnv>) =>
  c.req.header("CF-Connecting-IP") ?? "desconhecido";

/** Limite de consultas (leitura) por IP. Devolve a resposta 429 ou null. */
async function limitarConsulta(c: Context<AppEnv>) {
  if (await consumirLimite(c.env.DB, `consulta:${ipDe(c)}`, 120, 60))
    return null;
  return c.json({ erro: "Muitas consultas. Tente de novo em instantes." }, 429);
}

const barbeiroAtivo = (db: D1Database, id: string) =>
  db
    .prepare("SELECT id, nome FROM usuarios WHERE id = ? AND ativo = 1")
    .bind(id)
    .first<{ id: string; nome: string }>();

publico.get("/info", async (c) => {
  const bloqueado = await limitarConsulta(c);
  if (bloqueado) return bloqueado;
  const db = c.env.DB;
  const [cfg, servicos, barbeiros, dias] = await Promise.all([
    db
      .prepare(
        "SELECT chave, valor FROM config WHERE chave IN ('nome_barbearia', 'whatsapp_barbearia', 'endereco')",
      )
      .all<{ chave: string; valor: string }>(),
    db
      .prepare(
        "SELECT id, nome, duracao_min, preco_centavos FROM servicos WHERE ativo = 1 ORDER BY ordem, nome",
      )
      .all<ServicoLinha>(),
    db
      .prepare(
        `SELECT u.id, u.nome FROM usuarios u
           WHERE u.ativo = 1 AND EXISTS (SELECT 1 FROM expediente e WHERE e.usuario_id = u.id AND e.aberto = 1)
           ORDER BY u.nome`,
      )
      .all<{ id: string; nome: string }>(),
    diasAbertos(db, new Date()),
  ]);
  const v = Object.fromEntries(cfg.results.map((r) => [r.chave, r.valor]));
  return c.json({
    barbearia: {
      nome: v.nome_barbearia ?? "",
      whatsapp: v.whatsapp_barbearia ?? "",
      endereco: v.endereco ?? "",
    },
    servicos: servicos.results,
    barbeiros: barbeiros.results,
    dias,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? "",
  });
});

const consultaVagas = z.object({
  barbeiro: z.string().min(1).max(64),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  servicos: z.string().min(1).max(700),
});

publico.get("/vagas", async (c) => {
  const bloqueado = await limitarConsulta(c);
  if (bloqueado) return bloqueado;
  const analise = consultaVagas.safeParse(c.req.query());
  if (!analise.success) return c.json({ erro: MSG_INVALIDO }, 400);
  const { barbeiro, data, servicos: ids } = analise.data;
  const db = c.env.DB;
  const [dono, servicos] = await Promise.all([
    barbeiroAtivo(db, barbeiro),
    buscarServicos(db, ids.split(",")),
  ]);
  if (!dono || !servicos) return c.json({ erro: MSG_INVALIDO }, 400);
  const duracao = servicos.reduce((s, x) => s + x.duracao_min, 0);
  const minutos = await horariosLivres(db, new Date(), dono.id, data, duracao);
  return c.json({ horarios: minutos.map(hhmm) });
});

const corpoAgendar = z.object({
  barbeiro: z.string().min(1).max(64),
  servicos: z.array(z.string().min(1).max(64)).min(1).max(MAX_SERVICOS),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  nome: z.string().trim().min(1).max(60),
  telefone: z.string().min(1).max(30),
  aceite: z.literal(true),
  turnstile: z.string().min(1).max(2048),
});

publico.post(
  "/agendar",
  bodyLimit({
    maxSize: 8 * 1024,
    onError: (c) => c.json({ erro: "Requisição muito grande." }, 413),
  }),
  async (c) => {
    const db = c.env.DB;
    const ip = ipDe(c);
    // 1) Limite por IP, antes de qualquer outro trabalho.
    if (!(await consumirLimite(db, `agendar:${ip}`, 10, 3600)))
      return c.json(
        { erro: "Muitas tentativas. Tente de novo mais tarde." },
        429,
      );

    // 2) Sem segredo configurado o anti-robô não funciona: fecha em vez de aceitar sem verificar.
    if (!c.env.TURNSTILE_SECRET)
      return c.json({ erro: "Agendamento temporariamente indisponível." }, 503);

    const bruto = await c.req.json().catch(() => null);
    if (typeof bruto !== "object" || bruto === null)
      return c.json({ erro: MSG_INVALIDO }, 400);

    // 3) Anti-robô.
    const token = (bruto as { turnstile?: unknown }).turnstile;
    if (
      typeof token !== "string" ||
      !(await validarTurnstile(token, ip, c.env.TURNSTILE_SECRET, c.env.TURNSTILE_VERIFY_URL || undefined))
    )
      return c.json(
        {
          erro: "Não foi possível confirmar que você não é um robô. Tente de novo.",
        },
        403,
      );

    // 4) Dados.
    const analise = corpoAgendar.safeParse(bruto);
    if (!analise.success) return c.json({ erro: MSG_INVALIDO }, 400);
    const d = analise.data;
    const telefone = normalizarTelefone(d.telefone);
    if (!telefone)
      return c.json({ erro: "Informe um celular com DDD válido." }, 400);
    const [dono, servicos] = await Promise.all([
      barbeiroAtivo(db, d.barbeiro),
      buscarServicos(db, d.servicos),
    ]);
    if (!dono || !servicos) return c.json({ erro: MSG_INVALIDO }, 400);

    // 5) Janela, expediente e vagas: a hora pedida precisa estar entre as vagas calculadas.
    const agora = new Date();
    if (!(await diasAbertos(db, agora)).includes(d.data))
      return c.json({ erro: "Essa data não está disponível." }, 400);
    const duracao = servicos.reduce((s, x) => s + x.duracao_min, 0);
    const preco = servicos.reduce((s, x) => s + x.preco_centavos, 0);
    const [h = 0, m = 0] = d.hora.split(":").map(Number);
    const minuto = h * 60 + m;
    if (
      !(await horariosLivres(db, agora, dono.id, d.data, duracao)).includes(
        minuto,
      )
    ) {
      // Horário que acabou de ser tomado por outro agendamento é conflito (409); o resto é indisponível (400).
      const tomado = await db
        .prepare(
          `SELECT 1 FROM atendimentos WHERE usuario_id = ? AND status IN ('marcado', 'confirmado') AND inicio < ? AND fim > ?`,
        )
        .bind(
          dono.id,
          instanteUTC(d.data, minuto + duracao).toISOString(),
          instanteUTC(d.data, minuto).toISOString(),
        )
        .first();
      if (tomado) return c.json({ erro: MSG_CONFLITO }, 409);
      return c.json(
        { erro: "Esse horário não está disponível. Escolha outro." },
        400,
      );
    }

    // 6) Cliente por telefone normalizado. Cliente já existente (não removido) mantém o nome gravado:
    // quem só conhece o celular não consegue renomear. Removido é reativado com o novo nome.
    const agoraIso = agora.toISOString();
    const cliente = await db
      .prepare(
        `INSERT INTO clientes (id, nome, telefone, aceite_em, removido, criado_em) VALUES (?1, ?2, ?3, ?4, 0, ?4)
       ON CONFLICT (telefone) DO UPDATE SET
         nome = CASE WHEN clientes.removido = 1 THEN excluded.nome ELSE clientes.nome END,
         aceite_em = excluded.aceite_em, removido = 0
       RETURNING id`,
      )
      .bind(crypto.randomUUID(), d.nome, telefone, agoraIso)
      .first<{ id: string }>();
    if (!cliente)
      return c.json({ erro: "Não foi possível concluir o agendamento." }, 500);

    // 7) No máximo 2 agendamentos futuros ativos por celular: resposta rápida aqui e guarda atômica no INSERT.
    if ((await contarFuturosDoCliente(db, cliente.id, agoraIso)) >= MAX_FUTUROS)
      return c.json({ erro: MSG_LIMITE_CELULAR }, 422);

    const id = crypto.randomUUID();
    const inicio = instanteUTC(d.data, minuto).toISOString();
    const fim = instanteUTC(d.data, minuto + duracao).toISOString();
    const servicosTxt = servicos.map((s) => s.nome).join(" + ");
    const gravou = await inserirSemConflito(db, {
      id,
      clienteId: cliente.id,
      usuarioId: dono.id,
      servicosTxt,
      duracaoMin: duracao,
      precoCentavos: preco,
      inicio,
      fim,
      origem: "online",
      agora: agoraIso,
      limitePorCliente: MAX_FUTUROS,
    });
    if (!gravou) {
      // Nada gravado: foi o limite do celular (corrida entre requisições) ou conflito de horário?
      if (
        (await contarFuturosDoCliente(db, cliente.id, agoraIso)) >= MAX_FUTUROS
      )
        return c.json({ erro: MSG_LIMITE_CELULAR }, 422);
      return c.json({ erro: MSG_CONFLITO }, 409);
    }

    // Aviso ao barbeiro fora do caminho da resposta; falha aqui nunca derruba o agendamento.
    const aviso = notificarNovoAgendamento(c.env, id).catch((erro) =>
      console.error("Falha ao notificar", erro),
    );
    try {
      c.executionCtx.waitUntil(aviso);
    } catch {
      // Sem executionCtx (ambiente de teste direto): o aviso já está em andamento.
    }
    return c.json(
      {
        id,
        inicio,
        fim,
        servicos_txt: servicosTxt,
        preco_centavos: preco,
        barbeiro: dono.nome,
      },
      201,
    );
  },
);

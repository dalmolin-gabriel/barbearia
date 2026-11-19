// Consultas compartilhadas da agenda: horários ocupados e gravação sem conflito.

import { diasAbertosCliente } from "../../shared/janela";
import {
  diaSemanaDe,
  instanteUTC,
  partesLocais,
  somarDias,
} from "../../shared/tempo";
import {
  calcularVagas,
  type ExpedienteDia,
  type Intervalo,
} from "../../shared/vagas";

const MS_MINUTO = 60_000;

/**
 * Intervalos (em minutos desde 00:00 de Brasília) ocupados no dia: atendimentos `marcado`/`confirmado`
 * do barbeiro e bloqueios dele **e** da barbearia toda (`usuario_id IS NULL`), cortados ao dia.
 */
export async function ocupadosDoDia(
  db: D1Database,
  usuarioId: string,
  data: string,
): Promise<Intervalo[]> {
  const inicioDia = instanteUTC(data, 0);
  const fimDia = instanteUTC(somarDias(data, 1), 0);
  const ini = inicioDia.toISOString();
  const fim = fimDia.toISOString();
  const { results } = await db
    .prepare(
      `SELECT inicio, fim FROM atendimentos
         WHERE usuario_id = ?1 AND status IN ('marcado', 'confirmado') AND inicio < ?3 AND fim > ?2
       UNION ALL
       SELECT inicio, fim FROM bloqueios
         WHERE (usuario_id = ?1 OR usuario_id IS NULL) AND inicio < ?3 AND fim > ?2`,
    )
    .bind(usuarioId, ini, fim)
    .all<{ inicio: string; fim: string }>();
  const dia = (iso: string) =>
    Math.round((Date.parse(iso) - inicioDia.getTime()) / MS_MINUTO);
  return results.map((r) => ({
    ini: Math.max(0, dia(r.inicio)),
    fim: Math.min(1440, dia(r.fim)),
  }));
}

export type NovoAtendimento = {
  id: string;
  clienteId: string;
  usuarioId: string;
  servicosTxt: string;
  duracaoMin: number;
  precoCentavos: number;
  inicio: string; // ISO UTC
  fim: string; // ISO UTC
  origem: "online" | "painel";
  agora: string; // ISO UTC
  /** Só o agendamento público informa: máximo de atendimentos futuros ativos do cliente, checado no mesmo SQL. */
  limitePorCliente?: number;
};

/** Quantos atendimentos futuros ativos (`marcado`/`confirmado`) o cliente tem. */
export async function contarFuturosDoCliente(
  db: D1Database,
  clienteId: string,
  agoraIso: string,
): Promise<number> {
  const r = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM atendimentos WHERE cliente_id = ? AND status IN ('marcado', 'confirmado') AND inicio > ?",
    )
    .bind(clienteId, agoraIso)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/**
 * Grava o atendimento só se o barbeiro não tiver outro `marcado`/`confirmado` nem bloqueio (dele ou da
 * barbearia toda) sobrepondo o horário e, quando `limitePorCliente` vem, se o cliente ainda não atingiu
 * o limite. Verificações e gravação acontecem em UM comando SQL (atômico no D1): requisições paralelas
 * nunca gravam em conflito. Devolve `false` quando nada foi gravado.
 */
export async function inserirSemConflito(
  db: D1Database,
  a: NovoAtendimento,
): Promise<boolean> {
  const r = await db
    .prepare(
      `INSERT INTO atendimentos
         (id, cliente_id, usuario_id, servicos_txt, duracao_min, preco_centavos, inicio, fim, status, origem, criado_em, atualizado_em)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'marcado', ?9, ?10, ?10
       WHERE NOT EXISTS (
         SELECT 1 FROM atendimentos
           WHERE usuario_id = ?3 AND status IN ('marcado', 'confirmado') AND inicio < ?8 AND fim > ?7
       )
       AND NOT EXISTS (
         SELECT 1 FROM bloqueios WHERE (usuario_id = ?3 OR usuario_id IS NULL) AND inicio < ?8 AND fim > ?7
       )
       AND (?11 IS NULL OR (
         SELECT COUNT(*) FROM atendimentos
           WHERE cliente_id = ?2 AND status IN ('marcado', 'confirmado') AND inicio > ?10
       ) < ?11)`,
    )
    .bind(
      a.id,
      a.clienteId,
      a.usuarioId,
      a.servicosTxt,
      a.duracaoMin,
      a.precoCentavos,
      a.inicio,
      a.fim,
      a.origem,
      a.agora,
      a.limitePorCliente ?? null,
    )
    .run();
  return r.meta.changes === 1;
}

type ExpedienteLinha = {
  aberto: number;
  inicio_min: number;
  fim_min: number;
  almoco_ini_min: number | null;
  almoco_fim_min: number | null;
};

/** Datas (AAAA-MM-DD) que o cliente pode marcar agora, conforme a configuração de abertura. */
export async function diasAbertos(
  db: D1Database,
  agora: Date,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT chave, valor FROM config WHERE chave IN ('abertura_dia', 'abertura_minuto')",
    )
    .all<{ chave: string; valor: string }>();
  const cfg = Object.fromEntries(
    results.map((r) => [r.chave, Number(r.valor)]),
  );
  return diasAbertosCliente(agora, {
    aberturaDia: cfg.abertura_dia ?? 6,
    aberturaMinuto: cfg.abertura_minuto ?? 1380,
  });
}

/**
 * Horários (minutos desde 00:00) em que um serviço de `duracaoMin` cabe para o barbeiro no dia.
 * Data fora da janela do cliente devolve lista vazia. É a única fonte de verdade tanto da
 * consulta de vagas quanto da validação do agendamento.
 */
export async function horariosLivres(
  db: D1Database,
  agora: Date,
  usuarioId: string,
  data: string,
  duracaoMin: number,
): Promise<number[]> {
  if (!(await diasAbertos(db, agora)).includes(data)) return [];
  const exp = await db
    .prepare(
      "SELECT aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min FROM expediente WHERE usuario_id = ? AND dia_semana = ?",
    )
    .bind(usuarioId, diaSemanaDe(data))
    .first<ExpedienteLinha>();
  const expediente: ExpedienteDia | null = exp
    ? {
        aberto: exp.aberto === 1,
        inicioMin: exp.inicio_min,
        fimMin: exp.fim_min,
        almocoIniMin: exp.almoco_ini_min,
        almocoFimMin: exp.almoco_fim_min,
      }
    : null;
  const hoje = partesLocais(agora);
  return calcularVagas({
    duracaoMin,
    expediente,
    ocupados: await ocupadosDoDia(db, usuarioId, data),
    agoraMin: hoje.data === data ? hoje.minutos : null,
  });
}

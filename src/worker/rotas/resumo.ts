// Resumo mensal do dono. O mês é contado no fuso de Brasília: do dia 1 às 00:00 locais até o dia 1
// do mês seguinte às 00:00 locais, comparado com o `inicio` guardado em ISO UTC.

import { Hono } from "hono";
import { instanteUTC } from "../../shared/tempo";
import type { AppEnv } from "../env";
import { exigirDono, exigirLogin } from "../seguranca/middleware";

export const resumo = new Hono<AppEnv>();
resumo.use("*", exigirLogin(), exigirDono());

type Linha = { id: string; nome: string; faturamento_centavos: number; atendidos: number; faltas: number; cancelados: number };

resumo.get("/", async (c) => {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(c.req.query("mes") ?? "");
  if (!m) return c.json({ erro: "Informe o mês no formato AAAA-MM." }, 400);
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const proximo = mes === 12 ? `${String(ano + 1).padStart(4, "0")}-01` : `${m[1]}-${String(mes + 1).padStart(2, "0")}`;
  const ini = instanteUTC(`${m[1]}-${m[2]}-01`, 0).toISOString();
  const fim = instanteUTC(`${proximo}-01`, 0).toISOString();

  // LEFT JOIN a partir de usuarios: barbeiros desativados (e sem atendimentos) também aparecem.
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.nome,
            COALESCE(SUM(CASE WHEN a.status = 'atendido' THEN a.preco_centavos END), 0) AS faturamento_centavos,
            COUNT(CASE WHEN a.status = 'atendido' THEN 1 END) AS atendidos,
            COUNT(CASE WHEN a.status = 'faltou' THEN 1 END) AS faltas,
            COUNT(CASE WHEN a.status = 'cancelado' THEN 1 END) AS cancelados
       FROM usuarios u
       LEFT JOIN atendimentos a ON a.usuario_id = u.id AND a.inicio >= ?1 AND a.inicio < ?2
      GROUP BY u.id, u.nome
      ORDER BY u.nome, u.id`,
  )
    .bind(ini, fim)
    .all<Linha>();

  const soma = (campo: keyof Omit<Linha, "id" | "nome">) => results.reduce((t, l) => t + l[campo], 0);
  return c.json({
    faturamento_centavos: soma("faturamento_centavos"),
    atendidos: soma("atendidos"),
    faltas: soma("faltas"),
    cancelados: soma("cancelados"),
    porBarbeiro: results.map((l) => ({
      id: l.id,
      nome: l.nome,
      faturamento_centavos: l.faturamento_centavos,
      atendidos: l.atendidos,
    })),
  });
});

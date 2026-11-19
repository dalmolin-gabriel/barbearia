// Serviços da barbearia (só o dono). Não existe DELETE: serviço se desativa, para o histórico
// de atendimentos (que guarda preço e duração copiados) continuar coerente.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Servico } from "../../shared/tipos";
import type { AppEnv } from "../env";
import { exigirDono, exigirLogin } from "../seguranca/middleware";

export const servicos = new Hono<AppEnv>();
servicos.use("*", exigirLogin(), exigirDono());

const limiteCorpo = bodyLimit({
  maxSize: 8 * 1024,
  onError: (c) => c.json({ erro: "Requisição muito grande." }, 413),
});

const dados = z.object({
  nome: z.string().trim().min(1).max(60),
  duracao_min: z.number().int().min(5).max(480).multipleOf(5),
  preco_centavos: z.number().int().min(0).max(10_000_000),
});
const edicao = dados.extend({ ativo: z.boolean() });

servicos.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM servicos ORDER BY ordem, nome, id").all<Servico>();
  return c.json({ servicos: results });
});

servicos.post("/", limiteCorpo, async (c) => {
  const analise = dados.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: "Dados inválidos." }, 400);
  const d = analise.data;
  const id = crypto.randomUUID();
  // O novo serviço vai para o fim da lista.
  await c.env.DB.prepare(
    "INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem) VALUES (?1, ?2, ?3, ?4, 1, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM servicos))",
  )
    .bind(id, d.nome, d.duracao_min, d.preco_centavos)
    .run();
  const criado = await c.env.DB.prepare("SELECT * FROM servicos WHERE id = ?").bind(id).first<Servico>();
  return c.json(criado, 201);
});

servicos.put("/:id", limiteCorpo, async (c) => {
  const analise = edicao.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: "Dados inválidos." }, 400);
  const d = analise.data;
  const r = await c.env.DB.prepare(
    "UPDATE servicos SET nome = ?, duracao_min = ?, preco_centavos = ?, ativo = ? WHERE id = ?",
  )
    .bind(d.nome, d.duracao_min, d.preco_centavos, d.ativo ? 1 : 0, c.req.param("id"))
    .run();
  if (r.meta.changes !== 1) return c.json({ erro: "Serviço não encontrado." }, 404);
  const atual = await c.env.DB.prepare("SELECT * FROM servicos WHERE id = ?").bind(c.req.param("id")).first<Servico>();
  return c.json(atual);
});

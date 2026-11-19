// Equipe: o dono cadastra, edita e desativa barbeiros. O hash da senha nunca sai daqui.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Usuario } from "../../shared/tipos";
import type { AppEnv } from "../env";
import { exigirDono, exigirLogin } from "../seguranca/middleware";
import { gerarHashSenha } from "../seguranca/senha";

export const equipe = new Hono<AppEnv>();
equipe.use("*", exigirLogin(), exigirDono());

const limiteCorpo = bodyLimit({
  maxSize: 8 * 1024,
  onError: (c) => c.json({ erro: "Requisição muito grande." }, 413),
});

const COLUNAS = "id, nome, usuario, papel, ativo, criado_em";
const senha = z.string().min(8).max(200);
const novo = z.object({
  nome: z.string().trim().min(1).max(60),
  usuario: z.string().regex(/^[a-z0-9._-]{3,30}$/i),
  senha,
});
const edicao = z.object({
  nome: z.string().trim().min(1).max(60).optional(),
  ativo: z.boolean().optional(),
  senha: senha.optional(),
});

equipe.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${COLUNAS} FROM usuarios ORDER BY papel, nome, id`).all<Usuario>();
  return c.json({ equipe: results });
});

equipe.post("/", limiteCorpo, async (c) => {
  const analise = novo.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: "Dados inválidos." }, 400);
  const d = analise.data;
  const db = c.env.DB;
  // A coluna é NOCASE: "Ana" e "ana" são o mesmo usuário.
  if (await db.prepare("SELECT 1 FROM usuarios WHERE usuario = ?").bind(d.usuario).first())
    return c.json({ erro: "Esse usuário já existe." }, 409);
  const id = crypto.randomUUID();
  const hash = await gerarHashSenha(d.senha);
  try {
    // Usuário e expediente padrão (seg a sáb, 9h às 19h, almoço 12h às 13h; domingo fechado) juntos.
    await db.batch([
      db
        .prepare(
          "INSERT INTO usuarios (id, nome, usuario, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, 'barbeiro', 1, ?)",
        )
        .bind(id, d.nome, d.usuario, hash, new Date().toISOString()),
      ...Array.from({ length: 7 }, (_, dia) =>
        db
          .prepare(
            "INSERT INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min) VALUES (?, ?, ?, 540, 1140, 720, 780)",
          )
          .bind(id, dia, dia >= 1 ? 1 : 0),
      ),
    ]);
  } catch (erro) {
    // Cadastro simultâneo do mesmo usuário: a restrição UNIQUE do banco decide.
    if (String(erro).includes("UNIQUE")) return c.json({ erro: "Esse usuário já existe." }, 409);
    throw erro;
  }
  const criado = await db.prepare(`SELECT ${COLUNAS} FROM usuarios WHERE id = ?`).bind(id).first<Usuario>();
  return c.json(criado, 201);
});

equipe.put("/:id", limiteCorpo, async (c) => {
  const analise = edicao.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: "Dados inválidos." }, 400);
  const d = analise.data;
  const db = c.env.DB;
  const id = c.req.param("id");
  if (id === c.var.usuario.id && d.ativo === false)
    return c.json({ erro: "Você não pode desativar a si mesmo." }, 400);
  const alvo = await db.prepare("SELECT papel FROM usuarios WHERE id = ?").bind(id).first<{ papel: string }>();
  if (!alvo) return c.json({ erro: "Usuário não encontrado." }, 404);
  // Outro dono não é mexido por aqui (nem desativar, nem trocar senha ou nome).
  if (alvo.papel === "dono" && id !== c.var.usuario.id)
    return c.json({ erro: "Não é possível alterar outro dono." }, 403);

  const hash = d.senha === undefined ? null : await gerarHashSenha(d.senha);
  // Desativar ou trocar a senha encerra as sessões abertas; tudo numa transação só.
  const comandos = [
    db
      .prepare(
        "UPDATE usuarios SET nome = COALESCE(?1, nome), ativo = COALESCE(?2, ativo), senha_hash = COALESCE(?3, senha_hash) WHERE id = ?4",
      )
      .bind(d.nome ?? null, d.ativo === undefined ? null : d.ativo ? 1 : 0, hash, id),
  ];
  if (d.ativo === false || hash !== null) comandos.push(db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(id));
  await db.batch(comandos);
  const atual = await db.prepare(`SELECT ${COLUNAS} FROM usuarios WHERE id = ?`).bind(id).first<Usuario>();
  return c.json(atual);
});

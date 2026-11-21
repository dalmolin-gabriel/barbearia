// Conta do dono: código de recuperação da senha ("Esqueci minha senha").

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AppEnv } from "../env";
import { consumirLimite } from "../seguranca/limite";
import { exigirDono, exigirLogin } from "../seguranca/middleware";
import { gerarCodigoRecuperacao } from "../seguranca/recuperacao";
import { conferirSenha } from "../seguranca/senha";

export const conta = new Hono<AppEnv>();
conta.use("*", exigirLogin(), exigirDono());

const corpoGerar = z.object({ senha: z.string().min(1).max(200) });

/** Só a data de criação: nem o código nem o hash saem do servidor. */
conta.get("/recuperacao", async (c) => {
  const linha = await c.env.DB.prepare("SELECT recuperacao_hash, recuperacao_criado_em FROM usuarios WHERE id = ?")
    .bind(c.var.usuario.id)
    .first<{ recuperacao_hash: string | null; recuperacao_criado_em: string | null }>();
  return c.json({ criadoEm: linha?.recuperacao_hash ? (linha.recuperacao_criado_em ?? null) : null });
});

conta.post(
  "/recuperacao",
  bodyLimit({ maxSize: 8 * 1024, onError: (c) => c.json({ erro: "Requisição muito grande." }, 413) }),
  async (c) => {
    const analise = corpoGerar.safeParse(await c.req.json().catch(() => null));
    if (!analise.success) return c.json({ erro: "Informe a sua senha atual." }, 400);
    const db = c.env.DB;
    const eu = c.var.usuario;

    if (!(await consumirLimite(db, `recuperacao:${eu.id}`, 5, 15 * 60)))
      return c.json({ erro: "Muitas tentativas. Tente de novo em 15 minutos." }, 429);
    const linha = await db.prepare("SELECT senha_hash FROM usuarios WHERE id = ?").bind(eu.id).first<{ senha_hash: string }>();
    if (!linha || !(await conferirSenha(analise.data.senha, linha.senha_hash)))
      return c.json({ erro: "Senha incorreta." }, 403);

    // O código anterior deixa de valer assim que o novo é gravado.
    const novo = await gerarCodigoRecuperacao();
    await db
      .prepare("UPDATE usuarios SET recuperacao_hash = ?, recuperacao_criado_em = ? WHERE id = ?")
      .bind(novo.hash, new Date().toISOString(), eu.id)
      .run();
    return c.json({ codigoRecuperacao: novo.codigo });
  },
);

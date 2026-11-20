// Sistema: "Zerar sistema e entregar para o dono". Só o dono, com a própria senha e a palavra ZERAR.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../env";
import { consumirLimite } from "../seguranca/limite";
import { exigirDono, exigirLogin } from "../seguranca/middleware";
import { conferirSenha } from "../seguranca/senha";
import { NOME_COOKIE, opcoesCookieSessao } from "../seguranca/sessao";

export const sistema = new Hono<AppEnv>();

const corpoZerar = z.object({
  senha: z.string().min(1).max(200),
  confirmacao: z.literal("ZERAR"),
});

sistema.post(
  "/zerar",
  exigirLogin(),
  exigirDono(),
  bodyLimit({ maxSize: 8 * 1024, onError: (c) => c.json({ erro: "Requisição muito grande." }, 413) }),
  async (c) => {
    const analise = corpoZerar.safeParse(await c.req.json().catch(() => null));
    if (!analise.success) return c.json({ erro: "Informe a senha e digite ZERAR para confirmar." }, 400);
    const db = c.env.DB;
    const eu = c.var.usuario;

    // Quem tem a sessão aberta não pode ficar testando senhas sem limite.
    if (!(await consumirLimite(db, `zerar:${eu.id}`, 5, 15 * 60)))
      return c.json({ erro: "Muitas tentativas. Tente de novo em 15 minutos." }, 429);
    const linha = await db.prepare("SELECT senha_hash FROM usuarios WHERE id = ?").bind(eu.id).first<{ senha_hash: string }>();
    if (!linha || !(await conferirSenha(analise.data.senha, linha.senha_hash)))
      return c.json({ erro: "Senha incorreta." }, 403);

    // Tudo numa transação só, na ordem das chaves estrangeiras. Serviços e configurações ficam.
    await db.batch(
      [
        "push_inscricoes",
        "sessoes",
        "atendimentos",
        "bloqueios",
        "clientes",
        "expediente",
        "tentativas_login",
        "limites",
        "usuarios",
      ].map((tabela) => db.prepare(`DELETE FROM ${tabela}`)),
    );
    deleteCookie(c, NOME_COOKIE, opcoesCookieSessao);
    return c.body(null, 204);
  },
);

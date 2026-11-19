// Primeiro acesso: cria o dono da barbearia uma única vez, protegido por um código de instalação
// (secret CODIGO_INSTALACAO). Depois que existe qualquer usuário, a rota responde sempre 404.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { comandosExpedientePadrao } from "../db/expediente-padrao";
import type { AppEnv } from "../env";
import { consumirLimite } from "../seguranca/limite";
import { gerarHashSenha, iguaisEmTempoConstante } from "../seguranca/senha";
import { criarSessao, definirCookieSessao } from "../seguranca/sessao";

export const primeiroAcesso = new Hono<AppEnv>();

const NAO_ENCONTRADO = { erro: "Não encontrado." };

const dados = z.object({
  nome: z.string().trim().min(1).max(60),
  usuario: z.string().regex(/^[a-z0-9._-]{3,30}$/i),
  senha: z.string().min(8).max(200),
});

const SERVICOS_EXEMPLO = [
  { nome: "Corte", duracao: 30 },
  { nome: "Barba", duracao: 20 },
  { nome: "Corte + Barba", duracao: 50 },
];

async function semUsuarios(db: D1Database): Promise<boolean> {
  return !(await db.prepare("SELECT 1 FROM usuarios LIMIT 1").first());
}

/** Compara o código sem revelar, pelo tempo, quantos caracteres batem (compara os SHA-256). */
async function codigoConfere(enviado: string, esperado: string): Promise<boolean> {
  const resumo = async (t: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
  return iguaisEmTempoConstante(await resumo(enviado), await resumo(esperado));
}

primeiroAcesso.get("/", async (c) => {
  const disponivel = !!c.env.CODIGO_INSTALACAO && (await semUsuarios(c.env.DB));
  return c.json({ disponivel });
});

primeiroAcesso.post(
  "/",
  bodyLimit({ maxSize: 8 * 1024, onError: (c) => c.json({ erro: "Requisição muito grande." }, 413) }),
  async (c) => {
    const db = c.env.DB;
    const esperado = c.env.CODIGO_INSTALACAO;
    if (!esperado || !(await semUsuarios(db))) return c.json(NAO_ENCONTRADO, 404);

    const ip = c.req.header("CF-Connecting-IP") ?? "desconhecido";
    if (!(await consumirLimite(db, `primeiro-acesso:${ip}`, 5, 3600)))
      return c.json({ erro: "Muitas tentativas. Tente de novo mais tarde." }, 429);

    const corpo = await c.req.json().catch(() => null);
    const codigo = typeof corpo?.codigo === "string" ? corpo.codigo : "";
    if (!(await codigoConfere(codigo, esperado))) return c.json({ erro: "Código de instalação incorreto." }, 403);
    const analise = dados.safeParse(corpo);
    if (!analise.success) return c.json({ erro: "Dados inválidos." }, 400);
    const d = analise.data;

    const id = crypto.randomUUID();
    const hash = await gerarHashSenha(d.senha);
    const agora = new Date().toISOString();
    // Tudo num batch atômico. O primeiro comando só insere se ainda não há nenhum usuário; os
    // demais só gravam se esse usuário existe. Chamadas simultâneas: só uma cria o dono.
    let resultados: D1Result[];
    try {
      resultados = await db.batch([
        db
          .prepare(
            `INSERT INTO usuarios (id, nome, usuario, senha_hash, papel, ativo, criado_em)
             SELECT ?1, ?2, ?3, ?4, 'dono', 1, ?5 WHERE NOT EXISTS (SELECT 1 FROM usuarios)`,
          )
          .bind(id, d.nome, d.usuario, hash, agora),
        ...comandosExpedientePadrao(db, id),
        ...SERVICOS_EXEMPLO.map((s, ordem) =>
          db
            .prepare(
              `INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem)
               SELECT ?1, ?2, ?3, 0, 1, ?4 WHERE EXISTS (SELECT 1 FROM usuarios WHERE id = ?5)`,
            )
            .bind(crypto.randomUUID(), s.nome, s.duracao, ordem, id),
        ),
      ]);
    } catch (erro) {
      // Concorrência com UNIQUE no mesmo usuário: quem perdeu também recebe 404.
      if (String(erro).includes("UNIQUE")) return c.json(NAO_ENCONTRADO, 404);
      throw erro;
    }
    if (resultados[0]?.meta.changes !== 1) return c.json(NAO_ENCONTRADO, 404);

    const token = await criarSessao(db, id);
    definirCookieSessao(c, token);
    return c.json({ usuario: { id, nome: d.nome, papel: "dono" } }, 201);
  },
);

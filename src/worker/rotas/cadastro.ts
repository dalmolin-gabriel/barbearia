// Cadastro aberto, só para a primeira conta: cria o dono da barbearia uma única vez.
// Depois que existe qualquer usuário, a rota responde sempre 404 (o dono cria as demais contas em Equipe).

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { comandosExpedientePadrao } from "../db/expediente-padrao";
import type { AppEnv } from "../env";
import { emailSchema } from "../seguranca/email";
import { consumirLimite } from "../seguranca/limite";
import { gerarCodigoRecuperacao } from "../seguranca/recuperacao";
import { gerarHashSenha } from "../seguranca/senha";
import { criarSessao, definirCookieSessao } from "../seguranca/sessao";

export const cadastro = new Hono<AppEnv>();

const NAO_ENCONTRADO = { erro: "Não encontrado." };

const dados = z.object({
  email: emailSchema,
  senha: z.string().min(8).max(200),
});

/** Nome inicial do dono: a parte do e-mail antes do "@", com a primeira letra maiúscula (até 60 caracteres). */
function nomeDoEmail(email: string): string {
  const parte = email.split("@")[0] ?? "";
  return (parte.charAt(0).toUpperCase() + parte.slice(1)).slice(0, 60);
}

const SERVICOS_EXEMPLO = [
  { nome: "Corte", duracao: 30 },
  { nome: "Barba", duracao: 20 },
  { nome: "Corte + Barba", duracao: 50 },
];

async function semUsuarios(db: D1Database): Promise<boolean> {
  return !(await db.prepare("SELECT 1 FROM usuarios LIMIT 1").first());
}

cadastro.get("/", async (c) => c.json({ disponivel: await semUsuarios(c.env.DB) }));

cadastro.post(
  "/",
  bodyLimit({ maxSize: 8 * 1024, onError: (c) => c.json({ erro: "Requisição muito grande." }, 413) }),
  async (c) => {
    const db = c.env.DB;
    if (!(await semUsuarios(db))) return c.json(NAO_ENCONTRADO, 404);

    const ip = c.req.header("CF-Connecting-IP") ?? "desconhecido";
    if (!(await consumirLimite(db, `cadastro:${ip}`, 5, 3600)))
      return c.json({ erro: "Muitas tentativas. Tente de novo mais tarde." }, 429);

    const analise = dados.safeParse(await c.req.json().catch(() => null));
    if (!analise.success) return c.json({ erro: "Dados inválidos." }, 400);
    const d = analise.data;

    const nome = nomeDoEmail(d.email);
    const id = crypto.randomUUID();
    const hash = await gerarHashSenha(d.senha);
    const recuperacao = await gerarCodigoRecuperacao();
    const agora = new Date().toISOString();
    // Os três serviços de exemplo entram num único INSERT, só se não houver nenhum serviço
    // (por exemplo, depois de "Zerar sistema", que mantém os serviços).
    const exemplos = SERVICOS_EXEMPLO.map((s, ordem) => [crypto.randomUUID(), s.nome, s.duracao, ordem]);
    const valores = exemplos.map((_, i) => `(?${i * 4 + 1}, ?${i * 4 + 2}, ?${i * 4 + 3}, ?${i * 4 + 4})`).join(", ");
    const usuarioParam = exemplos.length * 4 + 1;

    // Tudo num batch atômico. O primeiro comando só insere se ainda não há nenhum usuário; os
    // demais só gravam se esse usuário existe. Chamadas simultâneas: só uma cria o dono.
    let resultados: D1Result[];
    try {
      resultados = await db.batch([
        db
          .prepare(
            `INSERT INTO usuarios (id, nome, usuario, senha_hash, papel, ativo, criado_em, recuperacao_hash, recuperacao_criado_em)
             SELECT ?1, ?2, ?3, ?4, 'dono', 1, ?5, ?6, ?5 WHERE NOT EXISTS (SELECT 1 FROM usuarios)`,
          )
          .bind(id, nome, d.email, hash, agora, recuperacao.hash),
        ...comandosExpedientePadrao(db, id),
        db
          .prepare(
            `INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem)
             SELECT column1, column2, column3, 0, 1, column4 FROM (VALUES ${valores})
             WHERE EXISTS (SELECT 1 FROM usuarios WHERE id = ?${usuarioParam})
               AND NOT EXISTS (SELECT 1 FROM servicos)`,
          )
          .bind(...exemplos.flat(), id),
      ]);
    } catch (erro) {
      // Concorrência com UNIQUE no mesmo e-mail: quem perdeu também recebe 404.
      if (String(erro).includes("UNIQUE")) return c.json(NAO_ENCONTRADO, 404);
      throw erro;
    }
    if (resultados[0]?.meta.changes !== 1) return c.json(NAO_ENCONTRADO, 404);

    const token = await criarSessao(db, id);
    definirCookieSessao(c, token);
    // O código de recuperação só aparece aqui, uma vez; no banco fica apenas o hash.
    return c.json({ usuario: { id, nome, papel: "dono" }, codigoRecuperacao: recuperacao.codigo }, 201);
  },
);

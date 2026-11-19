import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { Usuario } from "../../shared/tipos";
import type { Env } from "../env";
import { conferirSenha, gerarHashSenha } from "../seguranca/senha";
import { NOME_COOKIE, VALIDADE_SESSAO_S, apagarSessao, criarSessao, lerSessao } from "../seguranca/sessao";

export const auth = new Hono<{ Bindings: Env }>();

const MSG_CREDENCIAIS = "Usuário ou senha incorretos.";
const MSG_BLOQUEADO = "Muitas tentativas. Tente de novo em 15 minutos.";
const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

const corpoEntrar = z.object({
  usuario: z.string().trim().min(1).max(64),
  senha: z.string().min(1).max(200),
});

// Hash descartável para gastar o mesmo tempo de PBKDF2 quando o usuário não existe.
let hashFalso: Promise<string> | null = null;

const opcoesCookie = { httpOnly: true, secure: true, sameSite: "Strict", path: "/" } as const;

type LinhaLogin = Pick<Usuario, "id" | "nome" | "papel" | "ativo"> & { senha_hash: string };

auth.post("/entrar", async (c) => {
  const analise = corpoEntrar.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: "Informe usuário e senha." }, 400);
  const { usuario, senha } = analise.data;
  const db = c.env.DB;
  const agora = new Date();

  const tentativas = await db
    .prepare("SELECT falhas, bloqueado_ate FROM tentativas_login WHERE usuario = ?")
    .bind(usuario)
    .first<{ falhas: number; bloqueado_ate: string | null }>();
  if (tentativas?.bloqueado_ate) {
    if (tentativas.bloqueado_ate > agora.toISOString()) return c.json({ erro: MSG_BLOQUEADO }, 429);
    // Bloqueio vencido: recomeça a contagem do zero.
    await db.prepare("DELETE FROM tentativas_login WHERE usuario = ?").bind(usuario).run();
  }

  const linha = await db
    .prepare("SELECT id, nome, papel, ativo, senha_hash FROM usuarios WHERE usuario = ?")
    .bind(usuario)
    .first<LinhaLogin>();

  // Sempre roda um PBKDF2, exista o usuário ou não, para o tempo não revelar nada.
  hashFalso ??= gerarHashSenha("hash-descartavel");
  const confere = await conferirSenha(senha, linha?.senha_hash ?? (await hashFalso));

  if (!linha || !confere || linha.ativo !== 1) {
    // Incremento atômico; na 5ª falha seguida grava o prazo do bloqueio.
    const ate = new Date(agora.getTime() + BLOQUEIO_MS).toISOString();
    await db
      .prepare(
        `INSERT INTO tentativas_login (usuario, falhas, bloqueado_ate) VALUES (?1, 1, NULL)
         ON CONFLICT (usuario) DO UPDATE SET
           falhas = falhas + 1,
           bloqueado_ate = CASE WHEN falhas + 1 >= ?2 THEN ?3 ELSE bloqueado_ate END`,
      )
      .bind(usuario, MAX_FALHAS, ate)
      .run();
    return c.json({ erro: MSG_CREDENCIAIS }, 401);
  }

  await db.prepare("DELETE FROM tentativas_login WHERE usuario = ?").bind(usuario).run();
  const token = await criarSessao(db, linha.id);
  setCookie(c, NOME_COOKIE, token, { ...opcoesCookie, maxAge: VALIDADE_SESSAO_S });
  return c.json({ usuario: { id: linha.id, nome: linha.nome, papel: linha.papel } });
});

auth.post("/sair", async (c) => {
  const token = getCookie(c, NOME_COOKIE);
  if (token) await apagarSessao(c.env.DB, token);
  deleteCookie(c, NOME_COOKIE, opcoesCookie);
  return c.body(null, 204);
});

auth.get("/eu", async (c) => {
  const token = getCookie(c, NOME_COOKIE);
  const u = token ? await lerSessao(c.env.DB, token) : null;
  if (!u) return c.json({ erro: "Sessão inválida ou expirada." }, 401);
  return c.json({ usuario: { id: u.id, nome: u.nome, papel: u.papel } });
});

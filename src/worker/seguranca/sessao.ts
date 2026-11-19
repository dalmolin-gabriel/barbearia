import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { Usuario } from "../../shared/tipos";

export const NOME_COOKIE = "sessao";
export const VALIDADE_SESSAO_S = 30 * 24 * 60 * 60;
const VALIDADE_MS = VALIDADE_SESSAO_S * 1000;
// Só renova quando já passou mais de um dia, para não gravar a cada requisição.
const LIMITE_RENOVACAO_MS = 29 * 24 * 60 * 60 * 1000;

export const opcoesCookieSessao = { httpOnly: true, secure: true, sameSite: "Strict", path: "/" } as const;

/** Envia (ou reenvia, para renovar) o cookie de sessão com validade cheia. */
export function definirCookieSessao(c: Context, token: string): void {
  setCookie(c, NOME_COOKIE, token, { ...opcoesCookieSessao, maxAge: VALIDADE_SESSAO_S });
}

function paraBase64Url(bytes: Uint8Array): string {
  let texto = "";
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** O banco guarda só o SHA-256 do token: um vazamento do banco não entrega sessões. */
async function idDaSessao(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cria a sessão e devolve o token (que vai só no cookie). */
export async function criarSessao(db: D1Database, usuarioId: string): Promise<string> {
  const token = paraBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiraEm = new Date(Date.now() + VALIDADE_MS).toISOString();
  await db
    .prepare("INSERT INTO sessoes (id, usuario_id, expira_em) VALUES (?, ?, ?)")
    .bind(await idDaSessao(token), usuarioId, expiraEm)
    .run();
  return token;
}

type LinhaSessao = Usuario & { expira_em: string };

/**
 * Devolve o usuário da sessão, ou null se não existe, expirou ou o usuário está inativo.
 * `renovada` indica que a validade foi estendida: quem responde deve reenviar o cookie.
 */
export async function lerSessao(
  db: D1Database,
  token: string,
): Promise<{ usuario: Usuario; renovada: boolean } | null> {
  if (!token) return null;
  const id = await idDaSessao(token);
  const agora = Date.now();
  const linha = await db
    .prepare(
      `SELECT u.id, u.nome, u.usuario, u.papel, u.ativo, u.criado_em, s.expira_em
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.id = ? AND s.expira_em > ? AND u.ativo = 1`,
    )
    .bind(id, new Date(agora).toISOString())
    .first<LinhaSessao>();
  if (!linha) return null;
  const renovada = Date.parse(linha.expira_em) - agora < LIMITE_RENOVACAO_MS;
  if (renovada) {
    await db
      .prepare("UPDATE sessoes SET expira_em = ? WHERE id = ?")
      .bind(new Date(agora + VALIDADE_MS).toISOString(), id)
      .run();
  }
  const { expira_em: _expiraEm, ...usuario } = linha;
  return { usuario, renovada };
}

export async function apagarSessao(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessoes WHERE id = ?").bind(await idDaSessao(token)).run();
}

export async function apagarSessoesDoUsuario(db: D1Database, usuarioId: string): Promise<void> {
  await db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(usuarioId).run();
}

import { SELF, env } from "cloudflare:test";
import { criarSessao } from "../src/worker/seguranca/sessao";
import { gerarHashSenha } from "../src/worker/seguranca/senha";
import type { Papel } from "../src/shared/tipos";

export const SENHA_PADRAO = "senha-de-teste";
const ORIGEM = "https://exemplo.com";

// Gera o hash uma vez só: cada hash custa 100 mil iterações de PBKDF2.
let hashPadrao: Promise<string> | null = null;

/** Cria um usuário direto no banco e já abre uma sessão para ele. */
export async function criarUsuario(
  papel: Papel,
  opcoes: { usuario?: string; ativo?: boolean } /* `usuario` é o e-mail */ = {},
): Promise<{ id: string; usuario: string; senha: string; token: string }> {
  const id = crypto.randomUUID();
  const usuario = opcoes.usuario ?? `u-${id.slice(0, 8)}@exemplo.com`;
  hashPadrao ??= gerarHashSenha(SENHA_PADRAO);
  await env.DB.prepare(
    "INSERT INTO usuarios (id, nome, usuario, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, `Nome ${usuario}`, usuario, await hashPadrao, papel, opcoes.ativo === false ? 0 : 1, new Date().toISOString())
    .run();
  const token = await criarSessao(env.DB, id);
  return { id, usuario, senha: SENHA_PADRAO, token };
}

/** Faz uma requisição ao Worker, sempre com o Origin da própria URL. */
export function req(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; token?: string; ip?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGEM };
  if (opcoes.corpo !== undefined) headers["Content-Type"] = "application/json";
  if (opcoes.ip) headers["CF-Connecting-IP"] = opcoes.ip;
  if (opcoes.token) headers.Cookie = `sessao=${opcoes.token}`;
  return SELF.fetch(`${ORIGEM}${caminho}`, {
    method: opcoes.metodo ?? "GET",
    headers,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });
}

/** Extrai o valor do cookie `sessao` de uma resposta. */
export function tokenDoCookie(resposta: Response): string | null {
  const cookie = resposta.headers.get("Set-Cookie") ?? "";
  return /(?:^|[,\s])sessao=([^;]*)/.exec(cookie)?.[1] ?? null;
}

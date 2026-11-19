import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { Usuario } from "../../shared/tipos";
import type { AppEnv } from "../env";
import { NOME_COOKIE, definirCookieSessao, lerSessao } from "./sessao";

const CSP =
  "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

// Mantenha igual a public/_headers (que cobre os arquivos estáticos).
export const CABECALHOS_SEGURANCA = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000",
} as const;

const METODOS_QUE_ALTERAM = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Cabeçalhos de segurança em toda resposta (inclusive erros). */
export const cabecalhos = () =>
  createMiddleware<AppEnv>(async (c, proximo) => {
    await proximo();
    for (const [nome, valor] of Object.entries(CABECALHOS_SEGURANCA)) c.res.headers.set(nome, valor);
  });

/** CSRF: requisição que altera dados em /api/* só passa com Origin igual ao da própria requisição. */
export const conferirOrigem = () =>
  createMiddleware<AppEnv>(async (c, proximo) => {
    if (METODOS_QUE_ALTERAM.has(c.req.method) && c.req.header("Origin") !== new URL(c.req.url).origin) {
      return c.json({ erro: "Origem não permitida." }, 403);
    }
    await proximo();
  });

/** Exige sessão válida e põe o usuário em `c.var.usuario`; sem sessão, 401. */
export const exigirLogin = () =>
  createMiddleware<AppEnv>(async (c, proximo) => {
    const token = getCookie(c, NOME_COOKIE);
    const sessao = token ? await lerSessao(c.env.DB, token) : null;
    if (!token || !sessao) return c.json({ erro: "Sessão inválida ou expirada." }, 401);
    // A validade foi estendida no banco: reenvia o cookie para o navegador acompanhar.
    if (sessao.renovada) definirCookieSessao(c, token);
    c.set("usuario", sessao.usuario);
    await proximo();
  });

/** Usar depois de `exigirLogin`: só o dono passa; o barbeiro recebe 403. */
export const exigirDono = () =>
  createMiddleware<AppEnv>(async (c, proximo) => {
    if (c.var.usuario.papel !== "dono") return c.json({ erro: "Sem permissão para esta ação." }, 403);
    await proximo();
  });

/** O dono vê qualquer agenda; o barbeiro, só a própria. */
export function podeVerAgenda(usuario: Usuario, usuarioIdAlvo: string): boolean {
  return usuario.papel === "dono" || usuario.id === usuarioIdAlvo;
}

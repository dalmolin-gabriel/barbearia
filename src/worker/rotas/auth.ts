import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Usuario } from "../../shared/tipos";
import type { AppEnv } from "../env";
import { consumirLimite } from "../seguranca/limite";
import { exigirLogin } from "../seguranca/middleware";
import { conferirSenha } from "../seguranca/senha";
import { NOME_COOKIE, apagarSessao, criarSessao, definirCookieSessao, opcoesCookieSessao } from "../seguranca/sessao";

export const auth = new Hono<AppEnv>();

const MSG_CREDENCIAIS = "Usuário ou senha incorretos.";
const MSG_BLOQUEADO = "Muitas tentativas. Tente de novo em 15 minutos.";
const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

const corpoEntrar = z.object({
  usuario: z.string().trim().min(1).max(64),
  senha: z.string().min(1).max(200),
});

// Hash fixo (gerado uma vez, senha sem uso) para gastar o mesmo tempo de PBKDF2
// quando o usuário não existe.
const HASH_FALSO = "pbkdf2$100000$dCXZgpZiBG8vlZotGMZOeA==$0Q6oUdvSf3HOf9/yK86M1lMMG55B8UnrzJ4KwwhLkMM=";

type LinhaLogin = Pick<Usuario, "id" | "nome" | "papel" | "ativo"> & { senha_hash: string };

const limiteCorpo = bodyLimit({
  maxSize: 8 * 1024,
  onError: (c) => c.json({ erro: "Requisição muito grande." }, 413),
});

auth.post("/entrar", limiteCorpo, async (c) => {
  // Limite por IP, antes de qualquer consulta ao banco de usuários.
  const ip = c.req.header("CF-Connecting-IP") ?? "desconhecido";
  if (!(await consumirLimite(c.env.DB, `entrar:${ip}`, 20, 15 * 60))) return c.json({ erro: MSG_BLOQUEADO }, 429);
  const analise = corpoEntrar.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: "Informe usuário e senha." }, 400);
  const { usuario, senha } = analise.data;
  const db = c.env.DB;
  const agora = new Date();

  // Reserva a tentativa ANTES de conferir a senha, em um único comando atômico: tentativas
  // paralelas não podem passar do limite. Bloqueio vencido recomeça a contagem em 1.
  const agoraIso = agora.toISOString();
  const ate = new Date(agora.getTime() + BLOQUEIO_MS).toISOString();
  const reserva = await db
    .prepare(
      `INSERT INTO tentativas_login (usuario, falhas, bloqueado_ate) VALUES (?1, 1, NULL)
       ON CONFLICT (usuario) DO UPDATE SET
         falhas = CASE WHEN bloqueado_ate IS NOT NULL AND bloqueado_ate <= ?2 THEN 1 ELSE falhas + 1 END,
         bloqueado_ate = CASE
           WHEN bloqueado_ate IS NOT NULL AND bloqueado_ate <= ?2 THEN NULL
           WHEN bloqueado_ate IS NOT NULL THEN bloqueado_ate
           WHEN falhas + 1 >= ?3 THEN ?4
           ELSE NULL END
       RETURNING falhas, bloqueado_ate`,
    )
    .bind(usuario, agoraIso, MAX_FALHAS, ate)
    .first<{ falhas: number; bloqueado_ate: string | null }>();
  // A 5ª tentativa ainda é conferida (pode ser a senha certa); da 6ª em diante, bloqueado.
  if (!reserva || reserva.falhas > MAX_FALHAS) return c.json({ erro: MSG_BLOQUEADO }, 429);

  const linha = await db
    .prepare("SELECT id, nome, papel, ativo, senha_hash FROM usuarios WHERE usuario = ?")
    .bind(usuario)
    .first<LinhaLogin>();

  // Sempre roda um PBKDF2, exista o usuário ou não, para o tempo não revelar nada.
  const confere = await conferirSenha(senha, linha?.senha_hash ?? HASH_FALSO);

  // Falha: a tentativa já foi contada na reserva.
  if (!linha || !confere || linha.ativo !== 1) return c.json({ erro: MSG_CREDENCIAIS }, 401);

  await db.prepare("DELETE FROM tentativas_login WHERE usuario = ?").bind(usuario).run();
  const token = await criarSessao(db, linha.id);
  definirCookieSessao(c, token);
  return c.json({ usuario: { id: linha.id, nome: linha.nome, papel: linha.papel } });
});

auth.post("/sair", async (c) => {
  const token = getCookie(c, NOME_COOKIE);
  if (token) await apagarSessao(c.env.DB, token);
  deleteCookie(c, NOME_COOKIE, opcoesCookieSessao);
  return c.body(null, 204);
});

auth.get("/eu", exigirLogin(), (c) => {
  const u = c.var.usuario;
  return c.json({ usuario: { id: u.id, nome: u.nome, papel: u.papel } });
});

import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Usuario } from "../../shared/tipos";
import type { AppEnv } from "../env";
import { emailSchema } from "../seguranca/email";
import { consumirLimite } from "../seguranca/limite";
import { exigirLogin } from "../seguranca/middleware";
import { normalizarCodigo } from "../seguranca/recuperacao";
import { conferirSenha, gerarHashSenha } from "../seguranca/senha";
import { NOME_COOKIE, apagarSessao, criarSessao, definirCookieSessao, opcoesCookieSessao } from "../seguranca/sessao";

export const auth = new Hono<AppEnv>();

const MSG_CREDENCIAIS = "E-mail ou senha incorretos.";
const MSG_BLOQUEADO = "Muitas tentativas. Tente de novo em 15 minutos.";
const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

const corpoEntrar = z.object({
  email: emailSchema,
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
  if (!analise.success) return c.json({ erro: "Informe e-mail e senha." }, 400);
  const { email: usuario, senha } = analise.data; // a coluna `usuarios.usuario` guarda o e-mail
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

const MSG_RECUPERAR = "E-mail ou código de recuperação incorretos.";

const corpoRecuperar = z.object({
  email: emailSchema,
  codigo: z.string().min(1).max(40),
  novaSenha: z.string().min(8).max(200),
});

type LinhaRecuperar = { id: string; papel: string; ativo: number; recuperacao_hash: string | null };

// Redefine a senha do dono com o código de recuperação (uso único). Pública: por isso há limite por
// IP e por e-mail, e todo erro devolve a mesma resposta, com o mesmo gasto de PBKDF2.
auth.post("/recuperar", limiteCorpo, async (c) => {
  const db = c.env.DB;
  const ip = c.req.header("CF-Connecting-IP") ?? "desconhecido";
  if (!(await consumirLimite(db, `recuperar:${ip}`, 5, 3600))) return c.json({ erro: MSG_BLOQUEADO }, 429);
  const analise = corpoRecuperar.safeParse(await c.req.json().catch(() => null));
  if (!analise.success) return c.json({ erro: MSG_RECUPERAR }, 400);
  const { email, codigo, novaSenha } = analise.data;
  if (!(await consumirLimite(db, `recuperar-email:${email.toLowerCase()}`, 5, 24 * 3600)))
    return c.json({ erro: "Muitas tentativas para este e-mail. Tente de novo amanhã." }, 429);

  const linha = await db
    .prepare("SELECT id, papel, ativo, recuperacao_hash FROM usuarios WHERE usuario = ?")
    .bind(email)
    .first<LinhaRecuperar>();
  // Sempre um PBKDF2, exista o usuário (ou o código) ou não.
  const confere = await conferirSenha(normalizarCodigo(codigo), linha?.recuperacao_hash ?? HASH_FALSO);
  if (!linha?.recuperacao_hash || !confere || linha.papel !== "dono" || linha.ativo !== 1)
    return c.json({ erro: MSG_RECUPERAR }, 400);

  const hash = await gerarHashSenha(novaSenha);
  // Numa transação só: nova senha, código gasto, sessões e bloqueio de login apagados. O UPDATE
  // exige o código ainda guardado: dois pedidos simultâneos com o mesmo código não passam ambos.
  const [troca] = await db.batch([
    db
      .prepare(
        "UPDATE usuarios SET senha_hash = ?1, recuperacao_hash = NULL, recuperacao_criado_em = NULL WHERE id = ?2 AND recuperacao_hash = ?3",
      )
      .bind(hash, linha.id, linha.recuperacao_hash),
    db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(linha.id),
    db.prepare("DELETE FROM tentativas_login WHERE usuario = ?").bind(email),
  ]);
  if (troca?.meta.changes !== 1) return c.json({ erro: MSG_RECUPERAR }, 400);
  return c.body(null, 204);
});

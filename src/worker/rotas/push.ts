// Inscrições de Web Push do painel. A chave pública é aberta (o navegador precisa dela antes do login
// terminar de montar a tela); inscrever e cancelar exigem sessão.

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { enderecoPushPermitido } from "../push/enderecos";
import { exigirLogin } from "../seguranca/middleware";

export const push = new Hono<AppEnv>();

const base64url = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+={0,2}$/);
const endpoint = z.url({ protocol: /^https$/ }).max(2048);

const inscricao = z.object({ endpoint, keys: z.object({ p256dh: base64url, auth: base64url }) });
const MAX_POR_USUARIO = 10;

const cancelamento = z.object({ endpoint });

push.get("/chave", (c) => c.json({ chave: c.env.VAPID_PUBLIC_KEY ?? "" }));

push.post("/inscrever", exigirLogin(), async (c) => {
  const corpo = inscricao.safeParse(await c.req.json().catch(() => null));
  if (!corpo.success) return c.json({ erro: "Inscrição inválida." }, 400);
  const { endpoint: url, keys } = corpo.data;
  if (!enderecoPushPermitido(url)) return c.json({ erro: "Endereço de notificação não permitido." }, 400);
  // O endpoint é do aparelho: se outra conta entrar nele, a inscrição passa para quem entrou.
  await c.env.DB.prepare(
    `INSERT INTO push_inscricoes (id, usuario_id, endpoint, p256dh, auth, criado_em)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(crypto.randomUUID(), c.var.usuario.id, url, keys.p256dh, keys.auth, new Date().toISOString())
    .run();
  // Limite por usuário: mantém só as inscrições mais recentes.
  await c.env.DB.prepare(
    `DELETE FROM push_inscricoes WHERE usuario_id = ?1 AND id NOT IN (
       SELECT id FROM push_inscricoes WHERE usuario_id = ?1 ORDER BY criado_em DESC, rowid DESC LIMIT ?2)`,
  )
    .bind(c.var.usuario.id, MAX_POR_USUARIO)
    .run();
  return c.json({ ok: true });
});

push.delete("/inscrever", exigirLogin(), async (c) => {
  const corpo = cancelamento.safeParse(await c.req.json().catch(() => null));
  if (!corpo.success) return c.json({ erro: "Inscrição inválida." }, 400);
  await c.env.DB.prepare("DELETE FROM push_inscricoes WHERE endpoint = ? AND usuario_id = ?")
    .bind(corpo.data.endpoint, c.var.usuario.id)
    .run();
  return c.json({ ok: true });
});

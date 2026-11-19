import { Hono } from "hono";
import { aplicarMigracoes } from "./db/migrar";
import type { AppEnv } from "./env";
import { auth } from "./rotas/auth";
import { publico } from "./rotas/publico";
import { saude } from "./rotas/saude";
import { cabecalhos, conferirOrigem } from "./seguranca/middleware";

export const app = new Hono<AppEnv>();

// Cabeçalhos em toda resposta; CSRF só nas rotas da API.
app.use("*", cabecalhos());
app.use("/api/*", conferirOrigem());

// Aplica as migrações uma vez por instância do Worker, antes da primeira rota /api/*.
// Se falhar, zera a promessa para a próxima requisição tentar de novo.
let migracoes: Promise<void> | null = null;

app.use("/api/*", async (c, proximo) => {
  migracoes ??= aplicarMigracoes(c.env.DB);
  try {
    await migracoes;
  } catch (erro) {
    migracoes = null;
    console.error("Falha ao aplicar migrações", erro);
    return c.json({ erro: "Serviço indisponível no momento. Tente novamente em instantes." }, 503);
  }
  await proximo();
});

app.route("/api/saude", saude);
app.route("/api/auth", auth);
app.route("/api/publico", publico);

export default { fetch: app.fetch };

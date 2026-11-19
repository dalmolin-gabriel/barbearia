import { Hono } from "hono";
import { aplicarMigracoes } from "./db/migrar";
import type { AppEnv } from "./env";
import { agenda, atendimentos } from "./rotas/agenda";
import { auth } from "./rotas/auth";
import { bloqueios } from "./rotas/bloqueios";
import { clientes } from "./rotas/clientes";
import { equipe } from "./rotas/equipe";
import { expediente } from "./rotas/expediente";
import { primeiroAcesso } from "./rotas/primeiro-acesso";
import { publico } from "./rotas/publico";
import { push } from "./rotas/push";
import { resumo } from "./rotas/resumo";
import { saude } from "./rotas/saude";
import { servicos } from "./rotas/servicos";
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
app.route("/api/primeiro-acesso", primeiroAcesso);
app.route("/api/publico", publico);
app.route("/api/push", push);
app.route("/api/agenda", agenda);
app.route("/api/atendimentos", atendimentos);
app.route("/api/bloqueios", bloqueios);
app.route("/api/servicos", servicos);
app.route("/api/expediente", expediente);
app.route("/api/equipe", equipe);
app.route("/api/resumo", resumo);
app.route("/api/clientes", clientes);

export default { fetch: app.fetch };

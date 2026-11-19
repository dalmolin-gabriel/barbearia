import { Hono } from "hono";
import type { Env } from "./env";
import { saude } from "./rotas/saude";

export const app = new Hono<{ Bindings: Env }>();

app.route("/api/saude", saude);

export default { fetch: app.fetch };

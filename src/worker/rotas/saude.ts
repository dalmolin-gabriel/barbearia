import { Hono } from "hono";
import type { Env } from "../env";

export const saude = new Hono<{ Bindings: Env }>();

saude.get("/", (c) => c.json({ ok: true }));

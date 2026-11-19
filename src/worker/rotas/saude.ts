import { Hono } from "hono";
import type { AppEnv } from "../env";

export const saude = new Hono<AppEnv>();

saude.get("/", (c) => c.json({ ok: true }));

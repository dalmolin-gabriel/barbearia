import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

// Aplica as migrations de ./migrations no D1 de teste antes de cada arquivo.
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.MIGRACOES);
});

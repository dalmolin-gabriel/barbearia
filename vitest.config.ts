import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url)));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: {
          MIGRACOES: migrations,
          TURNSTILE_SECRET: "segredo-de-teste",
          // Em produção estas variáveis vêm do painel do Cloudflare (ver docs/IMPLANTACAO.md).
          TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
          VAPID_PUBLIC_KEY: "",
          // Um .dev.vars local (do e2e) não pode vazar para os testes: aqui vale o endereço padrão.
          TURNSTILE_VERIFY_URL: "",
        } },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/aplicar-migracoes.ts"],
    },
  };
});

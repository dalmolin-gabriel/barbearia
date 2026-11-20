import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// E2E no celular (iPhone 13 emulado, em Chromium) contra o Worker de verdade (`npm run dev`,
// plugin do Cloudflare para o Vite), com banco D1 local zerado a cada execução.
//
// As chaves de teste do Turnstile vão para o `.dev.vars` (ignorado pelo
// git), gerado aqui. Um `.dev.vars` que não foi gerado por este arquivo nunca é sobrescrito.
const MARCA = "# gerado por playwright.config.ts (e2e)";
const VARS = [
  MARCA,
  "TURNSTILE_SITE_KEY=1x00000000000000000000AA",
  "TURNSTILE_SECRET=1x0000000000000000000000000000000AA",
  // Por padrão o e2e não depende da internet: a verificação do token vai para um verificador
  // local (e2e/verificador-turnstile.mjs). Com E2E_TURNSTILE_REAL=1 usa a Cloudflare de verdade.
  ...(process.env.E2E_TURNSTILE_REAL ? [] : ["TURNSTILE_VERIFY_URL=http://127.0.0.1:8788/siteverify"]),
  "",
].join("\n");

// Só reescreve se mudou: o Vite reinicia o Worker quando o `.dev.vars` é tocado.
const atual = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf8") : null;
if (atual === null || (atual.startsWith(MARCA) && atual !== VARS)) writeFileSync(".dev.vars", VARS);
const ESTADO = ".wrangler/e2e";
// O processo principal do Playwright carrega este arquivo uma vez por execução; os workers também,
// então só zera o banco no processo principal (sem TEST_WORKER_INDEX).
if (process.env.TEST_WORKER_INDEX === undefined && !process.env.PW_E2E_ZERADO) {
  rmSync(ESTADO, { recursive: true, force: true });
  process.env.PW_E2E_ZERADO = "1";
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    ...devices["iPhone 13"],
    browserName: "chromium",
    defaultBrowserType: "chromium",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    },
  },
  webServer: [
    {
      command: "node e2e/verificador-turnstile.mjs",
      url: "http://127.0.0.1:8788",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://localhost:5173/api/saude",
      env: { E2E_ESTADO: ESTADO },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

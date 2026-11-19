import { defineConfig, devices } from "@playwright/test";

// E2E no celular (iPhone 13 emulado, em Chromium) contra `npm run dev`.
// Para o Turnstile passar sempre, o Worker de teste precisa da chave secreta de teste
// `1x0000000000000000000000000000000AA` (TURNSTILE_SECRET_KEY em .dev.vars).
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
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

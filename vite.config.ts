import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // No e2e (E2E_ESTADO), o banco local vai para uma pasta própria que o Playwright zera.
  plugins: [react(), cloudflare(process.env.E2E_ESTADO ? { persistState: { path: process.env.E2E_ESTADO } } : undefined)],
});

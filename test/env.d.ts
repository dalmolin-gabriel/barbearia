import type { D1Migration } from "cloudflare:test";
import type { Env as EnvApp } from "../src/worker/env";

// Tipa o `env` de "cloudflare:workers" com os bindings do Worker + migrations de teste.
declare global {
  interface Env extends EnvApp {
    MIGRACOES: D1Migration[];
  }
  namespace Cloudflare {
    interface Env extends EnvApp {
      MIGRACOES: D1Migration[];
    }
  }
}

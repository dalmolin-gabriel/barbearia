import type { Usuario } from "../shared/tipos";

// Bindings e variáveis do Worker. As variáveis podem estar vazias no primeiro
// deploy: o site precisa abrir mesmo assim.
export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  // Só para testes ponta a ponta sem internet: troca o endereço de verificação do Turnstile.
  TURNSTILE_VERIFY_URL?: string;
};

/** Tipos do Hono em todo o Worker: bindings e o usuário que `exigirLogin` coloca no contexto. */
export type AppEnv = { Bindings: Env; Variables: { usuario: Usuario } };

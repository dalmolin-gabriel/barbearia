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
  CODIGO_INSTALACAO?: string;
};

// Só aceitamos endpoints de serviços de Web Push conhecidos: o Worker faz fetch neles,
// então um endereço qualquer viraria SSRF.
const EXATOS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const SUFIXOS = [".push.apple.com", ".notify.windows.com", ".push.services.mozilla.com"];

export function enderecoPushPermitido(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return EXATOS.has(host) || SUFIXOS.some((s) => host.endsWith(s));
  } catch {
    return false;
  }
}

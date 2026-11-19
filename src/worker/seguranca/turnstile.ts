export const URL_VERIFICACAO = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Confere com a Cloudflare o token do desafio anti-robô. Qualquer falha (token vazio, rede, resposta ruim) vale como reprovado. */
export async function validarTurnstile(token: string, ip: string, segredo: string, url = URL_VERIFICACAO): Promise<boolean> {
  if (!token) return false;
  try {
    const resposta = await fetch(url, {
      method: "POST",
      body: new URLSearchParams({ secret: segredo, response: token, remoteip: ip }),
    });
    const dados = (await resposta.json()) as { success?: boolean };
    return dados.success === true;
  } catch {
    return false;
  }
}

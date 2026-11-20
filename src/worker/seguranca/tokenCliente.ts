// Link secreto do cliente para ver/cancelar o próprio horário (sem login). O token (32 bytes
// aleatórios) vai só na resposta do agendamento; o banco guarda apenas o SHA-256 em hexadecimal.

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function gerarTokenCliente(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let texto = "";
  for (const b of bytes) texto += String.fromCharCode(b);
  const token = btoa(texto).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return { token, hash: await hashToken(token) };
}

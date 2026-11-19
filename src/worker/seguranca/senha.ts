// Hash de senha com PBKDF2-SHA256 via Web Crypto. O Workers aceita no máximo
// 100000 iterações, então esse é o valor usado.
const ITERACOES = 100_000;
const BYTES_SAL = 16;
const BITS_HASH = 256;

function paraBase64(bytes: Uint8Array): string {
  let texto = "";
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto);
}

function deBase64(texto: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function derivar(senha: string, sal: Uint8Array<ArrayBuffer>, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, chave, BITS_HASH);
  return new Uint8Array(bits);
}

/** Gera `pbkdf2$100000$<sal b64>$<hash b64>` com sal aleatório. */
export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  const hash = await derivar(senha, sal, ITERACOES);
  return `pbkdf2$${ITERACOES}$${paraBase64(sal)}$${paraBase64(hash)}`;
}

/** Compara dois vetores sem parar no primeiro byte diferente. */
export function iguaisEmTempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  let diferenca = a.length ^ b.length;
  const tamanho = Math.max(a.length, b.length);
  for (let i = 0; i < tamanho; i++) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferenca === 0;
}

/** Confere a senha contra o hash guardado. Formato inválido nunca confere. */
export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 4 || partes[0] !== "pbkdf2") return false;
  const iteracoes = Number(partes[1]);
  const sal = deBase64(partes[2]!);
  const esperado = deBase64(partes[3]!);
  if (iteracoes !== ITERACOES || !sal || !esperado) return false;
  return iguaisEmTempoConstante(await derivar(senha, sal, iteracoes), esperado);
}

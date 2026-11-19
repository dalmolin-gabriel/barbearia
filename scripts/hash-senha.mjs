// Gera o hash de uma senha para colar no banco (console D1 do Cloudflare) quando o dono
// esquece a senha. Mesmo algoritmo de src/worker/seguranca/senha.ts: PBKDF2-SHA256,
// 100000 iterações, sal de 16 bytes. Uso:  node scripts/hash-senha.mjs 'nova-senha'
// Se mudar um dos dois arquivos, mude o outro (test/primeiro-acesso.test.ts confere os dois).
const ITERACOES = 100_000;

const paraBase64 = (bytes) => btoa(String.fromCharCode(...bytes));

export async function gerarHash(senha) {
  const sal = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const chave = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: ITERACOES },
    chave,
    256,
  );
  return `pbkdf2$${ITERACOES}$${paraBase64(sal)}$${paraBase64(new Uint8Array(bits))}`;
}

// Só roda como comando (node scripts/hash-senha.mjs ...), não quando importado pelos testes.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("hash-senha.mjs")) {
  const senha = process.argv[2];
  if (!senha) {
    console.error("Uso: node scripts/hash-senha.mjs 'nova-senha'");
    process.exit(1);
  }
  console.log(await gerarHash(senha));
}

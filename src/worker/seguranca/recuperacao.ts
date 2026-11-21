// Código de recuperação do dono: XXXX-XXXX-XXXX, sem caracteres ambíguos (0, O, 1, I, L).
// No banco fica só o hash PBKDF2 do código normalizado.
import { gerarHashSenha } from "./senha";

const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 caracteres
const TAMANHO = 12;

/** Normaliza o que a pessoa digitou: maiúsculas, sem traços nem espaços. */
export function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[\s-]/g, "");
}

/** 12 caracteres aleatórios (sorteio sem viés) no formato XXXX-XXXX-XXXX. */
export function sortearCodigo(): string {
  const limite = 256 - (256 % ALFABETO.length); // descarta bytes que enviesariam o resto
  let letras = "";
  while (letras.length < TAMANHO) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limite && letras.length < TAMANHO) letras += ALFABETO[b % ALFABETO.length];
    }
  }
  return `${letras.slice(0, 4)}-${letras.slice(4, 8)}-${letras.slice(8)}`;
}

/** Sorteia um código novo e devolve o texto (para mostrar uma vez) e o hash (para guardar). */
export async function gerarCodigoRecuperacao(): Promise<{ codigo: string; hash: string }> {
  const codigo = sortearCodigo();
  return { codigo, hash: await gerarHashSenha(normalizarCodigo(codigo)) };
}

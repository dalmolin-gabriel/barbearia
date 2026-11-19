// Telefones brasileiros: normalização e exibição. Sem API de Worker ou Node.

/**
 * Aceita DDD + celular (11 dígitos) ou o mesmo com 55 na frente (13 dígitos).
 * Devolve '55' + DDD + 9 dígitos, ou null se não for um celular válido.
 */
export function normalizarTelefone(entrada: string): string | null {
  let d = entrada.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  if (ddd[0] === "0" || ddd[1] === "0") return null;
  if (d[2] !== "9") return null;
  return "55" + d;
}

/** '5548999991234' -> '(48) 99999-1234'. Devolve a entrada se não for um número normalizado. */
export function formatarTelefone(norm: string): string {
  const m = /^55(\d{2})(\d{5})(\d{4})$/.exec(norm);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : norm;
}

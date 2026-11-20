// Valores em reais: leitura do que o dono digita e formatação pt-BR (sempre com centavos).

export const MAX_CENTAVOS = 10_000_000;

/**
 * Lê "12,50", "12.50", "12", "R$ 12,50" ou "1.234,50" e devolve centavos inteiros.
 * Devolve null se o texto não for um valor válido (vazio, negativo, mais de 2 casas, acima do limite).
 */
export function lerReais(texto: string): number | null {
  let t = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) {
    // Vírgula é o decimal; pontos antes dela são separadores de milhar.
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    // "1.234" sem vírgula: milhar.
    t = t.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const centavos = Math.round(Number(t) * 100);
  return centavos <= MAX_CENTAVOS ? centavos : null;
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** 1250 -> 'R$ 12,50'; 4000 -> 'R$ 40,00' (espaço comum entre R$ e o valor). */
export function formatarReais(centavos: number): string {
  return moeda.format(centavos / 100).replace(/\s/g, " ");
}

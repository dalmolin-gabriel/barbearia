// Cálculo puro dos horários livres de um dia. Sem API de Worker ou Node.

export type ExpedienteDia = {
  aberto: boolean;
  inicioMin: number;
  fimMin: number;
  almocoIniMin: number | null;
  almocoFimMin: number | null;
};

export type Intervalo = { ini: number; fim: number };

/** Intervalos semiabertos [ini, fim): encostar (fim == ini) não conta como choque. */
function colide(ini: number, fim: number, b: Intervalo): boolean {
  return ini < b.fim && b.ini < fim;
}

/**
 * Minutos de início (grade a partir da abertura, de `passo` em `passo`) em que o serviço cabe inteiro no expediente, fora do almoço e dos intervalos ocupados.
 * `agoraMin` só é informado para hoje; nesse caso exige `antecedenciaMin` de folga.
 */
export function calcularVagas(p: {
  duracaoMin: number;
  expediente: ExpedienteDia | null;
  ocupados: Intervalo[];
  agoraMin: number | null;
  passo?: number;
  antecedenciaMin?: number;
}): number[] {
  const { duracaoMin, expediente, ocupados, agoraMin } = p;
  const passo = p.passo ?? 15;
  const antecedencia = p.antecedenciaMin ?? 30;
  if (!expediente || !expediente.aberto || duracaoMin <= 0 || passo <= 0)
    return [];

  const { inicioMin, fimMin, almocoIniMin, almocoFimMin } = expediente;
  const almoco: Intervalo | null =
    almocoIniMin !== null &&
    almocoFimMin !== null &&
    almocoFimMin > almocoIniMin
      ? { ini: almocoIniMin, fim: almocoFimMin }
      : null;

  const minimo =
    agoraMin === null
      ? inicioMin
      : Math.max(inicioMin, agoraMin + antecedencia);
  // Primeiro ponto da grade que não é anterior ao mínimo.
  const primeiro = inicioMin + Math.ceil((minimo - inicioMin) / passo) * passo;

  const vagas: number[] = [];
  for (let ini = primeiro; ini + duracaoMin <= fimMin; ini += passo) {
    const fim = ini + duracaoMin;
    if (almoco && colide(ini, fim, almoco)) continue;
    if (ocupados.some((o) => colide(ini, fim, o))) continue;
    vagas.push(ini);
  }
  return vagas;
}

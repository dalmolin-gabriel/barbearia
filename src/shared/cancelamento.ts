// Regra de cancelamento pelo cliente (link secreto), usada pelo Worker e pela tela.

/** Antecedência mínima, em minutos, para o cliente cancelar sozinho. */
export const CANCELAMENTO_ANTECEDENCIA_MIN = 120;

/** Último instante (ISO UTC) em que o cliente ainda pode cancelar um horário que começa em `inicio`. */
export function limiteCancelamento(inicio: string): string {
  return new Date(new Date(inicio).getTime() - CANCELAMENTO_ANTECEDENCIA_MIN * 60_000).toISOString();
}

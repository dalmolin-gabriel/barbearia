// Regra da janela de marcação do cliente: segunda a sábado, a semana seguinte abre
// no sábado (aberturaDia) às aberturaMinuto, horário de Brasília.

import { diaSemanaDe, partesLocais, somarDias } from "./tempo";

export type ConfigJanela = { aberturaDia: number; aberturaMinuto: number };

const SABADO = 6;

/**
 * Datas (AAAA-MM-DD) de segunda a sábado que o cliente pode marcar, em ordem.
 * Começa hoje (os horários que já passaram saem no cálculo dos horários livres) e vai
 * até o sábado da semana atual; depois da abertura, ou no domingo, vai até o sábado seguinte.
 */
export function diasAbertosCliente(agora: Date, cfg: ConfigJanela): string[] {
  const { data: hoje, minutos, diaSemana } = partesLocais(agora);
  const abriuProxima =
    diaSemana === 0 ||
    diaSemana > cfg.aberturaDia ||
    (diaSemana === cfg.aberturaDia && minutos >= cfg.aberturaMinuto);
  const ateSabado = diaSemana === 0 ? SABADO : SABADO - diaSemana;
  const fim = ateSabado + (abriuProxima && diaSemana !== 0 ? 7 : 0);

  const dias: string[] = [];
  for (let i = 0; i <= fim; i++) {
    const d = somarDias(hoje, i);
    if (diaSemanaDe(d) !== 0) dias.push(d);
  }
  return dias;
}

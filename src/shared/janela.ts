// Regra da janela de marcação do cliente: segunda a sábado (nunca domingo). A semana
// seguinte abre em `aberturaDia` (1 = segunda … 6 = sábado) às `aberturaMinuto`,
// horário de Brasília. `semanas` (1 ou 2) é quantas semanas ficam abertas ao mesmo tempo.

import { diaSemanaDe, partesLocais, somarDias } from "./tempo";

export type ConfigJanela = { aberturaDia: number; aberturaMinuto: number; semanas: 1 | 2 };

const SABADO = 6;

/**
 * Datas (AAAA-MM-DD) de segunda a sábado que o cliente pode marcar, em ordem.
 * Começa hoje (os horários que já passaram saem no cálculo dos horários livres) e vai
 * até o sábado da semana atual + 7 × (semanas − 1) dias; depois do momento de abertura da
 * semana atual, ou no domingo, entra mais uma semana.
 */
export function diasAbertosCliente(agora: Date, cfg: ConfigJanela): string[] {
  const { data: hoje, minutos, diaSemana } = partesLocais(agora);
  const domingo = diaSemana === 0;
  const abriuMais = domingo || diaSemana > cfg.aberturaDia || (diaSemana === cfg.aberturaDia && minutos >= cfg.aberturaMinuto);
  const semanasAbertas = cfg.semanas + (abriuMais ? 1 : 0);
  // No domingo "hoje" já é a semana seguinte: o sábado da semana atual é o dia 6 à frente.
  const ateSabado = domingo ? SABADO : SABADO - diaSemana;
  // No domingo a semana "extra" é a que começa amanhã, então não soma mais 7 dias.
  const fim = ateSabado + 7 * (semanasAbertas - 1 - (domingo ? 1 : 0));

  const dias: string[] = [];
  for (let i = 0; i <= fim; i++) {
    const d = somarDias(hoje, i);
    if (diaSemanaDe(d) !== 0) dias.push(d);
  }
  return dias;
}

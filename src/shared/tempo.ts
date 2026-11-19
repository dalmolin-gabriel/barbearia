// Helpers de tempo puros, sempre no fuso de Brasília. Sem API de Worker ou Node.

const FUSO = "America/Sao_Paulo";

const formatador = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DIAS_MS = 86_400_000;

function partesNumericas(instante: Date) {
  const p: Record<string, string> = {};
  for (const x of formatador.formatToParts(instante)) p[x.type] = x.value;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
  };
}

function dataParaMs(data: string): number {
  const [a = 0, m = 1, d = 1] = data.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Data, minutos desde 00:00 e dia da semana (0 = domingo) de um instante, em Brasília. */
export function partesLocais(instante: Date): { data: string; minutos: number; diaSemana: number } {
  const { ano, mes, dia, hora, minuto } = partesNumericas(instante);
  const data = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return { data, minutos: hora * 60 + minuto, diaSemana: diaSemanaDe(data) };
}

/** Converte data local (AAAA-MM-DD) e minutos desde 00:00 em Brasília para o instante UTC. */
export function instanteUTC(data: string, minutos: number): Date {
  const alvo = dataParaMs(data) + minutos * 60_000;
  // Chute inicial tratando o horário local como UTC; corrige pela diferença real do fuso.
  const chute = new Date(alvo);
  const l = partesNumericas(chute);
  const localComoUtc = Date.UTC(l.ano, l.mes - 1, l.dia, l.hora, l.minuto);
  return new Date(alvo - (localComoUtc - alvo));
}

export function somarDias(data: string, n: number): string {
  return new Date(dataParaMs(data) + n * DIAS_MS).toISOString().slice(0, 10);
}

/** 0 = domingo. */
export function diaSemanaDe(data: string): number {
  return new Date(dataParaMs(data)).getUTCDay();
}

export function hhmm(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Data AAAA-MM-DD que existe no calendário (rejeita 2026-02-30). */
export function dataValida(data: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(data) && new Date(dataParaMs(data)).toISOString().slice(0, 10) === data;
}

// Lembrete, só neste aparelho, dos horários marcados (com o link secreto de cada um).
// Nada disso vai para o servidor; sem armazenamento disponível, a tela segue funcionando.

const CHAVE = "meus-horarios";
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export type MeuHorarioGuardado = { token: string; inicio: string; servicos_txt: string; barbeiro: string };

const valido = (x: unknown): x is MeuHorarioGuardado =>
  typeof x === "object" &&
  x !== null &&
  ["token", "inicio", "servicos_txt", "barbeiro"].every((k) => typeof (x as Record<string, unknown>)[k] === "string");

/** Lê a lista, descartando entradas inválidas e as que começaram há mais de 1 dia. */
export function lerMeusHorarios(agora = Date.now()): MeuHorarioGuardado[] {
  try {
    const bruto: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    if (!Array.isArray(bruto)) return [];
    return bruto.filter(valido).filter((h) => new Date(h.inicio).getTime() > agora - UM_DIA_MS);
  } catch {
    return [];
  }
}

function gravar(lista: MeuHorarioGuardado[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* sem armazenamento: o link da tela Pronto continua valendo */
  }
}

export function guardarMeuHorario(h: MeuHorarioGuardado) {
  gravar([...lerMeusHorarios().filter((x) => x.token !== h.token), h]);
}

export function esquecerMeuHorario(token: string) {
  gravar(lerMeusHorarios().filter((x) => x.token !== token));
}

/** Os que ainda vão acontecer, do mais próximo para o mais distante. */
export function proximosHorarios(agora = Date.now()): MeuHorarioGuardado[] {
  return lerMeusHorarios(agora)
    .filter((h) => new Date(h.inicio).getTime() > agora)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

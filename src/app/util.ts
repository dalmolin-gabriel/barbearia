// Formatação de datas (sempre Brasília), dinheiro e telefone para a interface.
import { diaSemanaDe, hhmm, partesLocais, somarDias } from "../shared/tempo";

export const NOME_PADRAO = "Barbearia dos Padilhas";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const nomeMes = (mes: number) => MESES[mes - 1] ?? "";
export const diaCurto = (diaSemana: number) => DIAS_CURTOS[diaSemana] ?? "";

const primeiraMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export const hojeLocal = () => partesLocais(new Date()).data;

/** 'AAAA-MM-DD' -> 'dd/mm' */
export function ddmm(data: string): string {
  const [, m = "", d = ""] = data.split("-");
  return `${d}/${m}`;
}

/** 'AAAA-MM-DD' -> 'Quinta, 03/12' (ou 'quinta, 03/12' com minuscula) */
export function diaExtenso(data: string, minuscula = false): string {
  const t = `${DIAS[diaSemanaDe(data)] ?? ""}, ${ddmm(data)}`;
  return minuscula ? t : primeiraMaiuscula(t);
}

/** 'AAAA-MM' -> 'Dezembro 2026' */
export function rotuloMes(mes: string): string {
  const [a = "", m = "1"] = mes.split("-");
  return `${nomeMes(Number(m))} ${a}`;
}

export const somarMeses = (mes: string, n: number): string => {
  const [a = 0, m = 1] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};

/** Data local (AAAA-MM-DD) e hora local (HH:MM) de um instante ISO UTC. */
export function dataDe(iso: string): string {
  return partesLocais(new Date(iso)).data;
}
export function horaDe(iso: string): string {
  return hhmm(partesLocais(new Date(iso)).minutos);
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
/** 6500 -> 'R$ 65' (com centavos só quando houver). */
export function reais(centavos: number): string {
  const v = centavos / 100;
  const f = Number.isInteger(v)
    ? moeda.format(v)
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return f.replace(/ /g, " ");
}

/** 50 -> '50 min'; 90 -> '1h30'; 120 -> '2h' */
export function duracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

/** Máscara de celular: '48999991234' -> '(48) 99999-1234' (aceita digitação parcial). */
export function mascararTelefone(entrada: string): string {
  const d = entrada.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;
export const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

/** Minutos entre agora e um instante ISO (arredondado). */
export const minutosAte = (iso: string, agora = Date.now()) =>
  Math.round((new Date(iso).getTime() - agora) / 60_000);

export { somarDias, diaSemanaDe };

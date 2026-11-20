import type { NomeIcone } from "../componentes/Icone";

export type ItemMenu = {
  nome: string;
  icone: NomeIcone;
  caminho: string;
  soDono: boolean;
};

/** Itens do menu lateral do painel, na ordem em que aparecem. */
export const ITENS_MENU: ItemMenu[] = [
  { nome: "Hoje", icone: "calendario", caminho: "/painel", soDono: false },
  {
    nome: "Lembretes",
    icone: "sino",
    caminho: "/painel/lembretes",
    soDono: false,
  },
  {
    nome: "Serviços",
    icone: "tesoura",
    caminho: "/painel/servicos",
    soDono: true,
  },
  {
    nome: "Horários e folgas",
    icone: "relogio",
    caminho: "/painel/horarios",
    soDono: false,
  },
  {
    nome: "Resumo do mês",
    icone: "grafico",
    caminho: "/painel/resumo",
    soDono: true,
  },
  { nome: "Equipe", icone: "equipe", caminho: "/painel/equipe", soDono: true },
  {
    nome: "Clientes",
    icone: "cliente",
    caminho: "/painel/clientes",
    soDono: true,
  },
];

export const semBarra = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);

export const itemAtual = (pathname: string): ItemMenu => ITENS_MENU.find((i) => i.caminho === semBarra(pathname)) ?? ITENS_MENU[0]!;

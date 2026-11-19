import type { Origem, Situacao } from "../../shared/tipos";

export type Atend = {
  id: string;
  usuario_id: string;
  barbeiro_nome: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  servicos_txt: string;
  duracao_min: number;
  preco_centavos: number;
  inicio: string;
  fim: string;
  status: Situacao;
  origem: Origem;
  criado_em?: string;
};

export type Bloq = {
  id: string;
  usuario_id: string | null;
  inicio: string;
  fim: string;
  motivo: string;
};

export type RespostaAgenda = { data: string; atendimentos: Atend[]; bloqueios: Bloq[] };

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  marcado: "Agendado",
  confirmado: "Confirmado",
  atendido: "Atendido",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

export const estaAtivo = (a: Atend) => a.status === "marcado" || a.status === "confirmado";

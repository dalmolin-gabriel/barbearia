// Tipos compartilhados entre o Worker e a interface, espelhando as colunas do banco.
// Booleanos do banco (0/1) chegam como número.

export type Papel = "dono" | "barbeiro";

export type Situacao = "marcado" | "confirmado" | "atendido" | "cancelado" | "faltou";

export type Origem = "online" | "painel";

export type Usuario = {
  id: string;
  nome: string;
  usuario: string;
  papel: Papel;
  ativo: number;
  criado_em: string;
};

export type Servico = {
  id: string;
  nome: string;
  duracao_min: number;
  preco_centavos: number;
  ativo: number;
  ordem: number;
};

export type Atendimento = {
  id: string;
  cliente_id: string;
  usuario_id: string;
  servicos_txt: string;
  duracao_min: number;
  preco_centavos: number;
  inicio: string;
  fim: string;
  status: Situacao;
  origem: Origem;
  criado_em: string;
  atualizado_em: string;
  // Presentes nas consultas da agenda (JOIN com clientes e usuarios).
  cliente_nome?: string;
  cliente_telefone?: string;
  barbeiro_nome?: string;
};

export type Expediente = {
  usuario_id: string;
  dia_semana: number; // 0 = domingo
  aberto: number;
  inicio_min: number;
  fim_min: number;
  almoco_ini_min: number | null;
  almoco_fim_min: number | null;
};

export type Bloqueio = {
  id: string;
  usuario_id: string | null; // null = barbearia toda
  inicio: string;
  fim: string;
  motivo: string;
  criado_por: string;
};

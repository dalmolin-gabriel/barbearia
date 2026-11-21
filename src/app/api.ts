// Cliente da API do Worker. Erros chegam como { erro: string } em português.

export class ErroApi extends Error {
  status: number;
  mensagem: string;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
    this.mensagem = mensagem;
  }
}

export type OpcoesApi = { metodo?: string; corpo?: unknown };

const MSG_REDE = "Sem conexão com o servidor. Confira a internet e tente de novo.";
const MSG_GENERICA = "Algo deu errado. Tente de novo.";

function dentroDoPainelLogado(): boolean {
  const p = window.location.pathname;
  return p.startsWith("/painel") && p !== "/painel/entrar" && p !== "/painel/cadastro" && p !== "/painel/esqueci-senha" && p !== "/painel/primeiro-acesso";
}

export async function api<T>(caminho: string, opcoes: OpcoesApi = {}): Promise<T> {
  const metodo = opcoes.metodo ?? (opcoes.corpo === undefined ? "GET" : "POST");
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      credentials: "same-origin",
      headers: opcoes.corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    });
  } catch {
    throw new ErroApi(0, MSG_REDE);
  }

  const texto = resposta.status === 204 ? "" : await resposta.text();
  let dados: unknown = null;
  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = null;
    }
  }

  if (!resposta.ok) {
    if (resposta.status === 401 && dentroDoPainelLogado()) {
      window.location.assign("/painel/entrar");
    }
    const msg =
      dados && typeof dados === "object" && "erro" in dados && typeof dados.erro === "string"
        ? dados.erro
        : MSG_GENERICA;
    throw new ErroApi(resposta.status, msg);
  }
  return dados as T;
}

/** Texto de erro para mostrar ao usuário, venha de onde vier. */
export function mensagemDe(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.mensagem;
  return MSG_GENERICA;
}

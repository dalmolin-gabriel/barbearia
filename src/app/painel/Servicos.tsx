import { useState } from "react";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Passo } from "../componentes/Passo";
import { Pagina } from "../componentes/Pagina";
import { useCarregar } from "../hooks";
import { formatarReais, lerReais } from "../../shared/dinheiro";
import { duracao, reais } from "../util";

type Servico = {
  id: string;
  nome: string;
  duracao_min: number;
  preco_centavos: number;
  ativo: number;
  ordem: number;
};
type Edicao = {
  id: string | null;
  nome: string;
  duracao: number;
  preco: string;
  ativo: boolean;
};

const NOVO: Edicao = {
  id: null,
  nome: "",
  duracao: 30,
  preco: formatarReais(4000),
  ativo: true,
};

export default function Servicos() {
  const lista = useCarregar(() => api<{ servicos: Servico[] }>("/api/servicos"), []);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const editar = (s: Servico) => {
    setErro(null);
    setEdicao({
      id: s.id,
      nome: s.nome,
      duracao: s.duracao_min,
      preco: formatarReais(s.preco_centavos),
      ativo: s.ativo === 1,
    });
  };

  async function salvar(ativo: boolean) {
    if (!edicao) return;
    if (!edicao.nome.trim()) return setErro("Informe o nome do serviço.");
    if (edicao.duracao < 5) return setErro("O tempo mínimo é de 5 minutos.");
    const centavos = lerReais(edicao.preco);
    if (centavos === null) return setErro("Informe o preço, por exemplo 12,50.");
    setSalvando(true);
    setErro(null);
    const corpo = {
      nome: edicao.nome.trim(),
      duracao_min: edicao.duracao,
      preco_centavos: centavos,
    };
    try {
      if (edicao.id)
        await api(`/api/servicos/${edicao.id}`, {
          metodo: "PUT",
          corpo: { ...corpo, ativo },
        });
      else await api("/api/servicos", { corpo });
      setEdicao(null);
      await lista.recarregar();
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setSalvando(false);
    }
  }

  const novo = () => {
    setErro(null);
    setEdicao(NOVO);
  };
  const servicos = lista.dados?.servicos ?? [];
  const colunas = "md:grid-cols-[minmax(0,2fr)_120px_120px_100px_80px]";

  return (
    <Pagina
      titulo="Serviços"
      sub="Preço e tempo de cada serviço"
      acoes={
        !edicao ? (
          <Botao compacto onClick={novo}>
            + Novo serviço
          </Botao>
        ) : null
      }
    >
      <div className={`grid items-start gap-6 ${edicao ? "xl:grid-cols-[minmax(0,1fr)_420px]" : ""}`}>
        <div className="flex flex-col gap-3">
          {lista.erro ? <Aviso>{lista.erro}</Aviso> : null}
          {lista.carregando && !lista.dados ? <Carregando /> : null}
          {servicos.length ? (
            <div className="cartao overflow-hidden">
              <div
                className={`hidden gap-4 border-b border-borda px-5 py-3 text-xs font-semibold uppercase tracking-wider text-texto-suave md:grid ${colunas}`}
              >
                <span>Serviço</span>
                <span>Tempo</span>
                <span>Preço</span>
                <span>Situação</span>
                <span />
              </div>
              {servicos.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 border-b border-borda px-5 py-3.5 last:border-b-0 md:grid md:gap-4 ${colunas} ${s.ativo === 1 ? "" : "opacity-60"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold">
                      {s.nome} {s.ativo === 1 ? null : <span className="pilula ml-1 text-texto-suave md:hidden">Inativo</span>}
                    </div>
                    <div className="text-[13px] text-texto-suave md:hidden">
                      {duracao(s.duracao_min)} · {reais(s.preco_centavos)}
                    </div>
                  </div>
                  <div className="hidden text-sm md:block">{duracao(s.duracao_min)}</div>
                  <div className="hidden text-sm font-semibold text-ouro md:block">{reais(s.preco_centavos)}</div>
                  <div className="hidden md:block">
                    <span className={`pilula ${s.ativo === 1 ? "text-ok" : "text-texto-suave"}`}>
                      {s.ativo === 1 ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="md:text-right">
                    <button
                      type="button"
                      onClick={() => editar(s)}
                      className="text-sm font-semibold text-ouro"
                      aria-label={`Editar ${s.nome}`}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {edicao ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-ouro/70 bg-superficie p-5">
            <b className="text-base">{edicao.id ? `Editando: ${edicao.nome || "serviço"}` : "Novo serviço"}</b>
            <div>
              <label className="rotulo block" htmlFor="s-nome">
                Nome
              </label>
              <input
                id="s-nome"
                className="campo"
                maxLength={60}
                value={edicao.nome}
                onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
              />
            </div>
            <Passo
              rotulo="Tempo estimado"
              valor={edicao.duracao}
              passo={5}
              minimo={5}
              maximo={480}
              sufixo="min"
              aoMudar={(v) => setEdicao({ ...edicao, duracao: v })}
            />
            <div>
              <label className="rotulo block" htmlFor="s-preco">
                Preço
              </label>
              <input
                id="s-preco"
                className="campo"
                inputMode="decimal"
                autoComplete="off"
                placeholder="R$ 0,00"
                value={edicao.preco}
                onChange={(e) => setEdicao({ ...edicao, preco: e.target.value })}
                onBlur={() => {
                  const c = lerReais(edicao.preco);
                  if (c !== null) setEdicao({ ...edicao, preco: formatarReais(c) });
                }}
              />
            </div>
            {erro ? <Aviso>{erro}</Aviso> : null}
            <Botao disabled={salvando} onClick={() => void salvar(edicao.ativo)}>
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
            <div className="flex gap-2">
              {edicao.id ? (
                <Botao
                  pequeno
                  variante="secundario"
                  className={edicao.ativo ? "!text-erro" : "!text-ok"}
                  disabled={salvando}
                  onClick={() => void salvar(!edicao.ativo)}
                >
                  {edicao.ativo ? "Desativar" : "Reativar"}
                </Botao>
              ) : null}
              <Botao pequeno variante="secundario" onClick={() => setEdicao(null)}>
                Cancelar
              </Botao>
            </div>
          </div>
        ) : null}
      </div>
    </Pagina>
  );
}

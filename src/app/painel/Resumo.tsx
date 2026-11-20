import { useState } from "react";
import { api } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Carregando } from "../componentes/Carregando";
import { Avatar } from "../componentes/Avatar";
import { Pagina } from "../componentes/Pagina";
import { useCarregar } from "../hooks";
import { hojeLocal, reais, rotuloMes, somarMeses } from "../util";

type Resumo = {
  faturamento_centavos: number;
  atendidos: number;
  faltas: number;
  cancelados: number;
  porBarbeiro: {
    id: string;
    nome: string;
    faturamento_centavos: number;
    atendidos: number;
  }[];
};

export default function ResumoMes() {
  const mesAtual = hojeLocal().slice(0, 7);
  const [mes, setMes] = useState(mesAtual);
  const r = useCarregar(() => api<Resumo>(`/api/resumo?mes=${mes}`), [mes]);
  const d = r.dados;
  const total = d?.porBarbeiro.reduce((s, b) => s + b.faturamento_centavos, 0) ?? 0;

  const seta = (alvo: string, rotulo: string, sinal: string, ativa: boolean) => (
    <button
      type="button"
      aria-label={rotulo}
      disabled={!ativa}
      onClick={() => setMes(alvo)}
      className={`h-9 w-9 text-[22px] leading-none ${ativa ? "text-texto" : "text-apagado"}`}
    >
      {sinal}
    </button>
  );

  const navegacaoMes = (
    <div className="flex items-center gap-1 rounded-full bg-superficie-alta px-1">
      {seta(somarMeses(mes, -1), "Mês anterior", "‹", true)}
      <span className="bebas min-w-[150px] text-center text-2xl tracking-[0.1em]">{rotuloMes(mes)}</span>
      {seta(somarMeses(mes, 1), "Próximo mês", "›", mes < mesAtual)}
    </div>
  );

  const cartao = (rotulo: string, valor: string | number, sub: string, ouro = false) => (
    <div className="cartao p-5">
      <div className="text-[13px] text-texto-suave">{rotulo}</div>
      <div className={`bebas mt-1 text-4xl leading-none ${ouro ? "text-ouro" : ""}`}>{valor}</div>
      <div className="mt-1.5 text-xs text-texto-suave">{sub}</div>
    </div>
  );

  return (
    <Pagina titulo="Resumo do mês" sub="Só o dono vê esta tela" acoes={navegacaoMes}>
      <div className="flex flex-col gap-5">
        {r.erro ? <Aviso>{r.erro}</Aviso> : null}
        {r.carregando && !d ? <Carregando /> : null}
        {d ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              {cartao("Faturamento", reais(d.faturamento_centavos), "atendidos no mês", true)}
              {cartao("Atendimentos", d.atendidos, "no mês")}
              {cartao("Faltas", d.faltas, d.faltas === 1 ? "falta" : "faltas")}
              {cartao("Cancelados", d.cancelados, d.cancelados === 1 ? "cancelado" : "cancelados")}
            </div>
            <b className="text-base">Por barbeiro</b>
            {d.porBarbeiro.length === 0 ? <p className="text-sm text-texto-suave">Sem atendimentos neste mês.</p> : null}
            {d.porBarbeiro.length ? (
              <div className="cartao overflow-hidden">
                <div className="hidden grid-cols-[minmax(0,1.2fr)_140px_140px_minmax(0,1.5fr)] gap-4 border-b border-borda px-5 py-3 text-xs font-semibold uppercase tracking-wider text-texto-suave md:grid">
                  <span>Barbeiro</span>
                  <span>Atendimentos</span>
                  <span>Faturamento</span>
                  <span>Participação</span>
                </div>
                {d.porBarbeiro.map((b) => {
                  const pct = total ? Math.round((b.faturamento_centavos / total) * 100) : 0;
                  return (
                    <div
                      key={b.id}
                      className="flex flex-col gap-2 border-b border-borda px-5 py-4 last:border-b-0 md:grid md:grid-cols-[minmax(0,1.2fr)_140px_140px_minmax(0,1.5fr)] md:items-center md:gap-4"
                    >
                      <div className="flex items-center gap-3 text-[15px]">
                        <Avatar nome={b.nome} tamanho={36} />
                        <b className="flex-1 font-semibold">{b.nome}</b>
                        <b className="text-ouro md:hidden">{reais(b.faturamento_centavos)}</b>
                      </div>
                      <div className="text-[13px] text-texto-suave md:text-sm md:text-texto">
                        {b.atendidos} {b.atendidos === 1 ? "atendimento" : "atendimentos"}
                      </div>
                      <b className="hidden text-ouro md:block">{reais(b.faturamento_centavos)}</b>
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 rounded bg-superficie-alta">
                          <div className="h-2 rounded bg-ouro" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-10 text-right text-xs text-texto-suave">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Pagina>
  );
}

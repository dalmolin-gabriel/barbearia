import { useState } from "react";
import { api } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Carregando } from "../componentes/Carregando";
import { Topo } from "../componentes/Topo";
import { useCarregar } from "../hooks";
import { hojeLocal, reais, rotuloMes, somarMeses } from "../util";

type Resumo = {
  faturamento_centavos: number;
  atendidos: number;
  faltas: number;
  cancelados: number;
  porBarbeiro: { id: string; nome: string; faturamento_centavos: number; atendidos: number }[];
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
      className={`px-2 text-[22px] leading-none ${ativa ? "text-texto" : "text-apagado"}`}
    >
      {sinal}
    </button>
  );

  return (
    <div className="flex flex-col">
      <Topo sub="Só o dono vê esta tela" titulo="Resumo do mês" />
      <div className="flex flex-col gap-3.5 px-5 pb-6">
        <div className="flex items-center justify-between">
          {seta(somarMeses(mes, -1), "Mês anterior", "‹", true)}
          <span className="bebas text-[26px] tracking-[0.12em]">{rotuloMes(mes)}</span>
          {seta(somarMeses(mes, 1), "Próximo mês", "›", mes < mesAtual)}
        </div>
        {r.erro ? <Aviso>{r.erro}</Aviso> : null}
        {r.carregando && !d ? <Carregando /> : null}
        {d ? (
          <>
            <div className="flex gap-2.5">
              <div className="cartao flex-1 p-3.5">
                <div className="text-[13px] text-texto-suave">Faturamento</div>
                <div className="bebas text-4xl text-ouro">{reais(d.faturamento_centavos)}</div>
                <div className="text-xs text-texto-suave">atendidos no mês</div>
              </div>
              <div className="cartao flex-1 p-3.5">
                <div className="text-[13px] text-texto-suave">Atendimentos</div>
                <div className="bebas text-4xl">{d.atendidos}</div>
                <div className="text-xs text-texto-suave">
                  {d.faltas} {d.faltas === 1 ? "falta" : "faltas"} · {d.cancelados} {d.cancelados === 1 ? "cancelado" : "cancelados"}
                </div>
              </div>
            </div>
            <b className="text-base">Por barbeiro</b>
            {d.porBarbeiro.length === 0 ? <p className="text-sm text-texto-suave">Sem atendimentos neste mês.</p> : null}
            {d.porBarbeiro.map((b) => (
              <div key={b.id} className="cartao flex flex-col gap-2 p-3.5">
                <div className="flex items-center justify-between text-[15px]">
                  <b className="font-semibold">{b.nome}</b>
                  <b className="text-ouro">{reais(b.faturamento_centavos)}</b>
                </div>
                <div className="text-[13px] text-texto-suave">
                  {b.atendidos} {b.atendidos === 1 ? "atendimento" : "atendimentos"}
                </div>
                <div className="h-2 rounded bg-superficie-alta">
                  <div className="h-2 rounded bg-ouro" style={{ width: `${total ? Math.round((b.faturamento_centavos / total) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

import { useState } from "react";
import { api } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Carregando } from "../componentes/Carregando";
import { Topo } from "../componentes/Topo";
import { useCarregar, useNomeBarbearia } from "../hooks";
import { diaExtenso, hojeLocal, horaDe, somarDias } from "../util";
import { linkLembrete } from "./Atendimento";
import { estaAtivo, type RespostaAgenda } from "./tipos";

const chave = (id: string) => `lembrete:${id}`;

function jaEnviado(id: string): boolean {
  try {
    return localStorage.getItem(chave(id)) === "1";
  } catch {
    return false;
  }
}

export default function Lembretes() {
  const barbearia = useNomeBarbearia();
  const [amanha, setAmanha] = useState(true);
  const [enviados, setEnviados] = useState<Record<string, boolean>>({});
  const hoje = hojeLocal();
  const data = amanha ? somarDias(hoje, 1) : hoje;
  const agenda = useCarregar(() => api<RespostaAgenda>(`/api/agenda?data=${data}&quem=meus`), [data]);

  const clientes = (agenda.dados?.atendimentos ?? []).filter(estaAtivo);
  const exemplo = clientes[0] ? linkLembrete(clientes[0], barbearia) : null;
  const textoExemplo = exemplo ? decodeURIComponent(exemplo.split("?text=")[1] ?? "") : "";

  const marcar = (id: string) => {
    try {
      localStorage.setItem(chave(id), "1");
    } catch {
      /* sem armazenamento: só marca nesta tela */
    }
    setEnviados((e) => ({ ...e, [id]: true }));
  };

  return (
    <div className="flex flex-col">
      <Topo
        sub={`${diaExtenso(data)} · ${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}`}
        titulo={amanha ? "Lembretes de amanhã" : "Lembretes de hoje"}
      />
      <div className="flex flex-col gap-2.5 px-5 pb-6">
        <div className="flex self-start rounded-full bg-superficie-alta p-[3px] text-xs font-semibold" role="group" aria-label="Dia dos lembretes">
          {[
            { v: false, n: "Hoje" },
            { v: true, n: "Amanhã" },
          ].map((o) => (
            <button
              key={o.n}
              type="button"
              aria-pressed={amanha === o.v}
              onClick={() => setAmanha(o.v)}
              className={`rounded-full px-3.5 py-1.5 ${amanha === o.v ? "bg-ouro text-fundo" : "text-texto-suave"}`}
            >
              {o.n}
            </button>
          ))}
        </div>
        <p className="text-sm text-texto-suave">
          Toque em cada cliente: o WhatsApp abre com a mensagem pronta. É só apertar enviar.
        </p>
        {textoExemplo ? <div className="rounded-[14px] bg-zap-fundo px-3.5 py-3 text-sm">{textoExemplo}</div> : null}
        {agenda.erro ? <Aviso>{agenda.erro}</Aviso> : null}
        {agenda.carregando && !agenda.dados ? <Carregando /> : null}
        {agenda.dados && clientes.length === 0 ? (
          <div className="cartao p-5 text-center text-[15px] text-texto-suave">Nenhum cliente para lembrar neste dia.</div>
        ) : null}
        <div className="flex flex-col gap-2">
          {clientes.map((a) => {
            const link = linkLembrete(a, barbearia);
            const enviado = enviados[a.id] ?? jaEnviado(a.id);
            return (
              <div key={a.id} className="cartao flex items-center gap-3 py-2.5 pl-3.5 pr-2.5">
                <b className="w-[46px] text-[15px] text-ouro">{horaDe(a.inicio)}</b>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{a.cliente_nome}</div>
                  <div className="truncate text-[13px] text-texto-suave">{a.servicos_txt}</div>
                </div>
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => marcar(a.id)}
                    className={`rounded-[10px] px-3 py-[9px] text-[13px] ${enviado ? "bg-superficie-alta font-semibold text-texto-suave" : "bg-zap font-bold text-white"}`}
                  >
                    {enviado ? "✓ Enviado" : "WhatsApp"}
                  </a>
                ) : (
                  <span className="text-xs text-texto-suave">Sem telefone</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { api } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Carregando } from "../componentes/Carregando";
import { Avatar } from "../componentes/Avatar";
import { Pagina } from "../componentes/Pagina";
import { useCarregar, useNomeBarbearia } from "../hooks";
import { diaExtenso, hojeLocal, horaDe, somarDias } from "../util";
import { useSessao } from "../sessao";
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
  const eu = useSessao();
  const dono = eu.papel === "dono";
  const barbearia = useNomeBarbearia();
  const [amanha, setAmanha] = useState(true);
  const [enviados, setEnviados] = useState<Record<string, boolean>>({});
  const hoje = hojeLocal();
  const data = amanha ? somarDias(hoje, 1) : hoje;
  // O dono vê os clientes de todos os barbeiros; o barbeiro, só os dele.
  const agenda = useCarregar(() => api<RespostaAgenda>(`/api/agenda?data=${data}&quem=${dono ? "todos" : "meus"}`), [data, dono]);

  const clientes = (agenda.dados?.atendimentos ?? []).filter(estaAtivo);
  const exemplo = clientes[0] ? linkLembrete(clientes[0], barbearia) : null;
  const textoExemplo = exemplo ? decodeURIComponent(exemplo.split("?text=")[1] ?? "") : "";
  const colunas = dono
    ? "lg:grid-cols-[80px_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_140px]"
    : "lg:grid-cols-[80px_minmax(0,1.3fr)_minmax(0,1.3fr)_140px]";

  const marcar = (id: string) => {
    try {
      localStorage.setItem(chave(id), "1");
    } catch {
      /* sem armazenamento: só marca nesta tela */
    }
    setEnviados((e) => ({ ...e, [id]: true }));
  };

  return (
    <Pagina
      titulo={amanha ? "Lembretes de amanhã" : "Lembretes de hoje"}
      sub={`${diaExtenso(data)} · ${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}`}
      acoes={
        <div className="flex rounded-full bg-superficie-alta p-[3px] text-sm font-semibold" role="group" aria-label="Dia dos lembretes">
          {[
            { v: false, n: "Hoje" },
            { v: true, n: "Amanhã" },
          ].map((o) => (
            <button
              key={o.n}
              type="button"
              aria-pressed={amanha === o.v}
              onClick={() => setAmanha(o.v)}
              className={`rounded-full px-4 py-1.5 ${amanha === o.v ? "bg-ouro text-fundo" : "text-texto-suave"}`}
            >
              {o.n}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:gap-6">
          <p className="text-sm text-texto-suave xl:w-1/2 xl:pt-3">
            Toque em cada cliente: o WhatsApp abre com a mensagem pronta. É só apertar enviar.
          </p>
          {textoExemplo ? <div className="rounded-2xl bg-zap-fundo px-4 py-3 text-sm xl:w-1/2">{textoExemplo}</div> : null}
        </div>
        {agenda.erro ? <Aviso>{agenda.erro}</Aviso> : null}
        {agenda.carregando && !agenda.dados ? <Carregando /> : null}
        {agenda.dados && clientes.length === 0 ? (
          <div className="cartao p-6 text-center text-[15px] text-texto-suave">
            {amanha ? "Tudo em dia! Ninguém pra lembrar amanhã." : "Tudo em dia! Ninguém pra lembrar hoje."}
          </div>
        ) : null}
        {clientes.length ? (
          <div className="cartao overflow-hidden">
            <div
              className={`hidden gap-4 border-b border-borda px-5 py-3 text-xs font-semibold uppercase tracking-wider text-texto-suave lg:grid ${colunas}`}
            >
              <span>Hora</span>
              <span>Cliente</span>
              <span>Serviço</span>
              {dono ? <span>Barbeiro</span> : null}
              <span />
            </div>
            {clientes.map((a) => {
              const link = linkLembrete(a, barbearia);
              const enviado = enviados[a.id] ?? jaEnviado(a.id);
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-3 border-b border-borda px-4 py-3 last:border-b-0 lg:grid lg:gap-4 lg:px-5 ${colunas}`}
                >
                  <b className="w-[46px] text-[15px] text-ouro lg:w-auto">{horaDe(a.inicio)}</b>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar nome={a.cliente_nome} tamanho={36} />
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold">{a.cliente_nome}</div>
                      <div className="truncate text-[13px] text-texto-suave lg:hidden">
                        {a.servicos_txt}
                        {dono ? ` · ${a.barbeiro_nome}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="hidden truncate text-sm text-texto-suave lg:block">{a.servicos_txt}</div>
                  {dono ? <div className="hidden truncate text-sm lg:block">{a.barbeiro_nome}</div> : null}
                  <div className="lg:text-right">
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => marcar(a.id)}
                        className={`inline-block rounded-[10px] px-3 py-[9px] text-[13px] ${enviado ? "bg-superficie-alta font-semibold text-texto-suave" : "bg-zap font-bold text-white"}`}
                      >
                        {enviado ? "✓ Enviado" : "WhatsApp"}
                      </a>
                    ) : (
                      <span className="text-xs text-texto-suave">Sem telefone</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </Pagina>
  );
}

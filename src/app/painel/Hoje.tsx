import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Calendario } from "../componentes/Calendario";
import { Carregando } from "../componentes/Carregando";
import { Folha } from "../componentes/Folha";
import { Secao, Topo } from "../componentes/Topo";
import { useAtualizar, useCarregar, useNomeBarbearia } from "../hooks";
import { useSessao } from "../sessao";
import { ddmm, diaCurto, diaSemanaDe, duracao, hojeLocal, horaDe, minutosAte, somarDias } from "../util";
import Atendimento, { linkLembrete } from "./Atendimento";
import Bloquear from "./Bloquear";
import MarcarCliente from "./MarcarCliente";
import Notificacoes from "./Notificacoes";
import { estaAtivo, type Atend, type Bloq, type RespostaAgenda } from "./tipos";

function tituloDoDia(data: string, hoje: string): string {
  if (data === hoje) return `Hoje · ${ddmm(data)}`;
  if (data === somarDias(hoje, 1)) return `Amanhã · ${ddmm(data)}`;
  if (data === somarDias(hoje, -1)) return `Ontem · ${ddmm(data)}`;
  return `${diaCurto(diaSemanaDe(data))} · ${ddmm(data)}`;
}

function emTexto(a: Atend, agora: number): string {
  const min = minutosAte(a.inicio, agora);
  if (min <= 0) return "agora";
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `em ${h}h${r ? String(r).padStart(2, "0") : ""}`;
}

function periodoBloqueio(b: Bloq): string {
  const minutos = (new Date(b.fim).getTime() - new Date(b.inicio).getTime()) / 60_000;
  return minutos >= 1440 ? "Dia inteiro" : `${horaDe(b.inicio)} – ${horaDe(b.fim)}`;
}

function Linha({ a, mostrarBarbeiro, aoAbrir, ultima }: { a: Atend; mostrarBarbeiro: boolean; aoAbrir: () => void; ultima: boolean }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={`flex w-full items-center gap-3.5 py-[9px] text-left ${ultima ? "" : "border-b border-borda"}`}
    >
      <b className="bebas w-[62px] text-[26px] text-ouro">{horaDe(a.inicio)}</b>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-bold">{a.cliente_nome}</span>
        <span className="block truncate text-sm text-texto-suave">
          {a.servicos_txt} · {duracao(a.duracao_min)}
          {mostrarBarbeiro ? ` · ${a.barbeiro_nome}` : ""}
        </span>
      </span>
    </button>
  );
}

export default function Hoje() {
  const eu = useSessao();
  const dono = eu.papel === "dono";
  const barbearia = useNomeBarbearia();
  const [data, setData] = useState(hojeLocal());
  const [quem, setQuem] = useState<"meus" | "todos">("meus");
  const [agora, setAgora] = useState(Date.now());
  const [aberto, setAberto] = useState<Atend | null>(null);
  const [remarcando, setRemarcando] = useState<Atend | null>(null);
  const [marcando, setMarcando] = useState(false);
  const [bloqueando, setBloqueando] = useState(false);
  const [escolhendoData, setEscolhendoData] = useState(false);
  const [mesCal, setMesCal] = useState(data.slice(0, 7));
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const agenda = useCarregar(
    () => api<RespostaAgenda>(`/api/agenda?data=${data}&quem=${dono ? quem : "meus"}`),
    [data, quem, dono],
  );
  useAtualizar(() => {
    setAgora(Date.now());
    void agenda.recarregar();
  }, 60_000);
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const hoje = hojeLocal();
  const todos = dono && quem === "todos";
  const lista = agenda.dados?.atendimentos ?? [];
  const ativos = lista.filter(estaAtivo);
  const atendidos = lista.filter((a) => a.status === "atendido");
  const proximo = ativos.find((a) => new Date(a.fim).getTime() > agora) ?? null;
  const atrasados = ativos.filter((a) => a !== proximo && new Date(a.fim).getTime() <= agora);
  const depois = ativos.filter((a) => a !== proximo && !atrasados.includes(a));
  const bloqueios = agenda.dados?.bloqueios ?? [];

  async function chegou(a: Atend) {
    setErroAcao(null);
    try {
      await api(`/api/atendimentos/${a.id}/situacao`, { metodo: "PATCH", corpo: { situacao: "atendido" } });
      await agenda.recarregar();
    } catch (e) {
      setErroAcao(mensagemDe(e));
    }
  }

  async function removerBloqueio(b: Bloq) {
    setErroAcao(null);
    try {
      await api(`/api/bloqueios/${b.id}`, { metodo: "DELETE" });
      await agenda.recarregar();
    } catch (e) {
      setErroAcao(mensagemDe(e));
    }
  }

  const recarregarTudo = () => {
    setAberto(null);
    setRemarcando(null);
    setMarcando(false);
    setBloqueando(false);
    void agenda.recarregar();
  };

  const seletorQuem = dono ? (
    <div className="flex rounded-full bg-superficie-alta p-[3px] text-xs font-semibold" role="group" aria-label="Agenda de quem">
      {(["meus", "todos"] as const).map((q) => (
        <button
          key={q}
          type="button"
          aria-pressed={quem === q}
          onClick={() => setQuem(q)}
          className={`rounded-full px-2.5 py-1.5 ${quem === q ? "bg-ouro text-fundo" : "text-texto-suave"}`}
        >
          {q === "meus" ? "Meus" : "Todos"}
        </button>
      ))}
    </div>
  ) : null;

  const linkProximo = proximo ? linkLembrete(proximo, barbearia) : null;

  return (
    <div className="flex min-h-full flex-col">
      <Topo
        titulo={tituloDoDia(data, hoje)}
        sub={`${ativos.length + atendidos.length} ${ativos.length + atendidos.length === 1 ? "cliente" : "clientes"} · ${atendidos.length} ${atendidos.length === 1 ? "atendido" : "atendidos"}`}
        direita={seletorQuem}
        subAbaixo
      />

      <div className="flex flex-col gap-2 px-5 pb-4">
        {!dono ? <Notificacoes soSeInativas /> : null}
        {erroAcao ? <Aviso>{erroAcao}</Aviso> : null}
        {agenda.erro ? <Aviso>{agenda.erro}</Aviso> : null}
        {agenda.carregando && !agenda.dados ? <Carregando /> : null}

        <button
          type="button"
          onClick={() => {
            setMesCal(data.slice(0, 7));
            setEscolhendoData(true);
          }}
          className="self-start rounded-full bg-superficie-alta px-3.5 py-1.5 text-[13px] font-semibold"
        >
          📅 Escolher data
        </button>

        {agenda.dados && lista.length === 0 ? (
          <div className="cartao mt-1 p-5 text-center text-[15px] text-texto-suave">Nenhum cliente neste dia.</div>
        ) : null}

        {proximo ? (
          <>
            <div className="mt-1 flex items-center justify-between">
              <Secao ouro>PRÓXIMO CLIENTE</Secao>
              {data === hoje ? <span className="pilula bg-ouro/15 text-ouro">{emTexto(proximo, agora)}</span> : null}
            </div>
            <div className="flex flex-col gap-1 rounded-[18px] border-2 border-ouro bg-superficie px-4 py-3.5">
              <button type="button" onClick={() => setAberto(proximo)} className="flex flex-col gap-1 text-left">
                <span className="bebas text-[44px] leading-none text-ouro">{horaDe(proximo.inicio)}</span>
                <span className="text-[26px] font-bold leading-tight">{proximo.cliente_nome}</span>
                <span className="text-[17px] text-texto-suave">
                  {proximo.servicos_txt} · {duracao(proximo.duracao_min)}
                  {todos ? ` · ${proximo.barbeiro_nome}` : ""}
                </span>
              </button>
              <div className="mt-2.5 flex gap-2.5">
                <Botao pequeno onClick={() => void chegou(proximo)}>
                  ✓ Chegou
                </Botao>
                {linkProximo ? (
                  <BotaoLink pequeno variante="whatsapp" href={linkProximo} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </BotaoLink>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {atrasados.length ? (
          <>
            <Secao className="mt-1.5">SEM BAIXA</Secao>
            <div className="cartao px-4 py-0.5">
              {atrasados.map((a, i) => (
                <Linha key={a.id} a={a} mostrarBarbeiro={todos} aoAbrir={() => setAberto(a)} ultima={i === atrasados.length - 1} />
              ))}
            </div>
          </>
        ) : null}

        {depois.length ? (
          <>
            <Secao className="mt-1.5">DEPOIS</Secao>
            <div className="cartao px-4 py-0.5">
              {depois.map((a, i) => (
                <Linha key={a.id} a={a} mostrarBarbeiro={todos} aoAbrir={() => setAberto(a)} ultima={i === depois.length - 1} />
              ))}
            </div>
          </>
        ) : null}

        {atendidos.length ? (
          <>
            <Secao className="mt-1">✓ JÁ ATENDIDOS</Secao>
            <div className="px-4 opacity-45">
              {atendidos.map((a) => (
                <button key={a.id} type="button" onClick={() => setAberto(a)} className="flex w-full items-center gap-3.5 py-1.5 text-left">
                  <b className="w-[62px] text-[15px]">{horaDe(a.inicio)}</b>
                  <span className="flex-1 truncate text-[15px]">{a.cliente_nome}</span>
                  <span className="truncate text-sm">{a.servicos_txt}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {bloqueios.length ? (
          <>
            <Secao className="mt-1">BLOQUEIOS</Secao>
            <div className="cartao px-4 py-1">
              {bloqueios.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">
                      {periodoBloqueio(b)}
                      {b.motivo ? ` · ${b.motivo}` : ""}
                    </div>
                    <div className="text-xs text-texto-suave">{b.usuario_id ? "Só este barbeiro" : "Barbearia toda"}</div>
                  </div>
                  {dono || b.usuario_id === eu.id ? (
                    <button
                      type="button"
                      aria-label="Remover bloqueio"
                      onClick={() => void removerBloqueio(b)}
                      className="px-2 text-lg text-texto-suave"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div className="mt-2 flex gap-2">
          <Botao pequeno onClick={() => setMarcando(true)}>
            + Marcar cliente
          </Botao>
          <Botao pequeno variante="secundario" onClick={() => setBloqueando(true)}>
            Bloquear
          </Botao>
        </div>
        <Link to="/painel/lembretes" className="rounded-xl bg-superficie-alta py-3 text-center text-[15px] font-semibold text-ouro">
          Lembretes de amanhã ›
        </Link>
      </div>

      <div className="sticky bottom-0 mt-auto flex gap-2 bg-fundo px-5 pb-2 pt-2">
        <Botao pequeno variante="secundario" onClick={() => setData(somarDias(hoje, -1))}>
          ‹ Ontem
        </Botao>
        <Botao pequeno variante={data === hoje ? "contorno" : "secundario"} onClick={() => setData(hoje)}>
          Hoje
        </Botao>
        <Botao pequeno variante="secundario" onClick={() => setData(somarDias(hoje, 1))}>
          Amanhã ›
        </Botao>
      </div>

      {aberto ? (
        <Atendimento
          atendimento={aberto}
          aoFechar={() => setAberto(null)}
          aoMudou={recarregarTudo}
          aoRemarcar={(a) => {
            setAberto(null);
            setRemarcando(a);
          }}
        />
      ) : null}
      {remarcando ? (
        <MarcarCliente remarcar={remarcando} dataInicial={data} aoFechar={() => setRemarcando(null)} aoSalvo={recarregarTudo} />
      ) : null}
      {marcando ? <MarcarCliente dataInicial={data} aoFechar={() => setMarcando(false)} aoSalvo={recarregarTudo} /> : null}
      {bloqueando ? <Bloquear dataInicial={data} aoFechar={() => setBloqueando(false)} aoSalvo={recarregarTudo} /> : null}
      <Folha aberta={escolhendoData} aoFechar={() => setEscolhendoData(false)} rotulo="Escolher data">
        <Calendario
          mes={mesCal}
          selecionado={data}
          aoMudarMes={setMesCal}
          aoEscolher={(d) => {
            setData(d);
            setEscolhendoData(false);
          }}
          riscados={(d) => diaSemanaDe(d) === 0}
        />
      </Folha>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Calendario } from "../componentes/Calendario";
import { Carregando } from "../componentes/Carregando";
import { Folha } from "../componentes/Folha";
import { Avatar } from "../componentes/Avatar";
import { Pagina } from "../componentes/Pagina";
import { Secao } from "../componentes/Secao";
import { useAtualizar, useCarregar, useNomeBarbearia } from "../hooks";
import { useSessao } from "../sessao";
import {
  ddmm,
  dataPorExtenso,
  diaCurto,
  diaSemanaDe,
  duracao,
  hojeLocal,
  horaDe,
  minutosAte,
  primeiroNome,
  reais,
  saudacao,
  somarDias,
} from "../util";
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
      className={`flex w-full items-center gap-3.5 py-3 text-left ${ultima ? "" : "border-b border-borda"}`}
    >
      <b className="bebas w-[62px] text-[26px] text-ouro">{horaDe(a.inicio)}</b>
      <Avatar nome={a.cliente_nome} tamanho={40} />
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
  const [sucesso, setSucesso] = useState<string | null>(null);

  const agenda = useCarregar(() => api<RespostaAgenda>(`/api/agenda?data=${data}&quem=${dono ? quem : "meus"}`), [data, quem, dono]);
  useAtualizar(() => {
    setAgora(Date.now());
    void agenda.recarregar();
  }, 60_000);
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!sucesso) return;
    const t = window.setTimeout(() => setSucesso(null), 5000);
    return () => window.clearTimeout(t);
  }, [sucesso]);

  const hoje = hojeLocal();
  const todos = dono && quem === "todos";
  const lista = agenda.dados?.atendimentos ?? [];
  const ativos = lista.filter(estaAtivo);
  const atendidos = lista.filter((a) => a.status === "atendido");
  const proximo = ativos.find((a) => new Date(a.fim).getTime() > agora) ?? null;
  const atrasados = ativos.filter((a) => a !== proximo && new Date(a.fim).getTime() <= agora);
  const depois = ativos.filter((a) => a !== proximo && !atrasados.includes(a));
  const bloqueios = agenda.dados?.bloqueios ?? [];
  const totalClientes = ativos.length + atendidos.length;
  const previsto = [...ativos, ...atendidos].reduce((s, a) => s + a.preco_centavos, 0);

  async function chegou(a: Atend) {
    setErroAcao(null);
    try {
      await api(`/api/atendimentos/${a.id}/situacao`, {
        metodo: "PATCH",
        corpo: { situacao: "atendido" },
      });
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

  const recarregarTudo = (mensagem?: string) => {
    setAberto(null);
    setRemarcando(null);
    setMarcando(false);
    setBloqueando(false);
    if (mensagem) setSucesso(mensagem);
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
          className={`rounded-full px-3 py-1.5 ${quem === q ? "bg-ouro text-fundo" : "text-texto-suave"}`}
        >
          {q === "meus" ? "Meus" : "Todos"}
        </button>
      ))}
    </div>
  ) : null;

  const linkProximo = proximo ? linkLembrete(proximo, barbearia) : null;
  const rotuloVazio = data === hoje ? "hoje" : data === somarDias(hoje, 1) ? "amanhã" : "este dia";

  const cartaoNumero = (rotulo: string, valor: string, ouro = false) => (
    <div className="cartao px-4 py-3.5">
      <div className="text-xs text-texto-suave">{rotulo}</div>
      <div className={`bebas mt-0.5 text-[30px] leading-none ${ouro ? "text-ouro" : ""}`}>{valor}</div>
    </div>
  );

  return (
    <Pagina
      titulo={tituloDoDia(data, hoje)}
      sub={`${totalClientes} ${totalClientes === 1 ? "cliente" : "clientes"} · ${atendidos.length} ${atendidos.length === 1 ? "atendido" : "atendidos"}`}
      acoes={
        <>
          <Botao compacto onClick={() => setMarcando(true)}>
            + Marcar cliente
          </Botao>
          <Botao compacto variante="secundario" onClick={() => setBloqueando(true)}>
            Bloquear
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-semibold">
            {saudacao()}, {primeiroNome(eu.nome)}!
          </h2>
          <p className="text-sm text-texto-suave">{dataPorExtenso(hoje)}</p>
        </div>

        {!dono ? <Notificacoes soSeInativas /> : null}
        {sucesso ? <Aviso tipo="ok">{sucesso}</Aviso> : null}
        {erroAcao ? <Aviso>{erroAcao}</Aviso> : null}
        {agenda.erro ? <Aviso>{agenda.erro}</Aviso> : null}
        {agenda.carregando && !agenda.dados ? <Carregando /> : null}

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Escolher o dia">
          <Botao compacto variante="secundario" onClick={() => setData(somarDias(hoje, -1))}>
            ‹ Ontem
          </Botao>
          <Botao compacto variante={data === hoje ? "contorno" : "secundario"} onClick={() => setData(hoje)}>
            Hoje
          </Botao>
          <Botao compacto variante="secundario" onClick={() => setData(somarDias(hoje, 1))}>
            Amanhã ›
          </Botao>
          <button
            type="button"
            onClick={() => {
              setMesCal(data.slice(0, 7));
              setEscolhendoData(true);
            }}
            className="h-10 rounded-xl bg-superficie-alta px-4 text-sm font-semibold"
          >
            📅 Escolher data
          </button>
          <span className="flex-1" />
          {seletorQuem}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr]">
          <div className="grid grid-cols-3 gap-3 xl:col-start-2 xl:row-start-1">
            {cartaoNumero("Clientes hoje", String(totalClientes))}
            {cartaoNumero("Atendidos", String(atendidos.length))}
            {cartaoNumero("Previsto hoje", reais(previsto), true)}
          </div>

          <div className="flex flex-col gap-3 xl:col-start-1 xl:row-span-2 xl:row-start-1">
            {agenda.dados && lista.length === 0 ? (
              <div className="cartao p-6 text-center text-[15px] text-texto-suave">
                {data < hoje ? "Ninguém foi marcado neste dia." : `Nenhum cliente marcado para ${rotuloVazio}. Bom momento pra um café ☕`}
              </div>
            ) : null}

            {proximo ? (
              <>
                <div className="flex items-center justify-between">
                  <Secao ouro>PRÓXIMO CLIENTE</Secao>
                  {data === hoje ? <span className="pilula bg-ouro/15 text-ouro">{emTexto(proximo, agora)}</span> : null}
                </div>
                <div className="flex flex-col gap-1 rounded-2xl border border-ouro/70 bg-superficie p-5 shadow-[0_0_28px_rgba(208,184,72,0.08)]">
                  <button type="button" onClick={() => setAberto(proximo)} className="flex items-center gap-4 text-left">
                    <Avatar nome={proximo.cliente_nome} tamanho={64} />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="bebas text-[44px] leading-none text-ouro">{horaDe(proximo.inicio)}</span>
                      <span className="truncate text-[26px] font-bold leading-tight">{proximo.cliente_nome}</span>
                      <span className="text-[17px] text-texto-suave">
                        {proximo.servicos_txt} · {duracao(proximo.duracao_min)}
                        {todos ? ` · ${proximo.barbeiro_nome}` : ""}
                      </span>
                    </span>
                  </button>
                  <div className="mt-3 flex gap-2.5 sm:max-w-md">
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
                <Secao className="mt-2">SEM BAIXA</Secao>
                <div className="cartao px-5 py-1">
                  {atrasados.map((a, i) => (
                    <Linha key={a.id} a={a} mostrarBarbeiro={todos} aoAbrir={() => setAberto(a)} ultima={i === atrasados.length - 1} />
                  ))}
                </div>
              </>
            ) : null}

            {depois.length ? (
              <>
                <Secao className="mt-2">DEPOIS</Secao>
                <div className="cartao px-5 py-1">
                  {depois.map((a, i) => (
                    <Linha key={a.id} a={a} mostrarBarbeiro={todos} aoAbrir={() => setAberto(a)} ultima={i === depois.length - 1} />
                  ))}
                </div>
              </>
            ) : null}

            {bloqueios.length ? (
              <>
                <Secao className="mt-2">BLOQUEIOS</Secao>
                <div className="cartao px-5 py-1">
                  {bloqueios.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 py-2.5">
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
          </div>

          <div className="xl:col-start-2 xl:row-start-2">
            {atendidos.length ? (
              <div className="flex flex-col gap-2">
                <Secao>✓ JÁ ATENDIDOS</Secao>
                <div className="cartao px-4 py-1.5">
                  {atendidos.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAberto(a)}
                      className="flex w-full items-center gap-3 py-2 text-left opacity-60"
                    >
                      <Avatar nome={a.cliente_nome} tamanho={32} />
                      <b className="w-12 text-[15px]">{horaDe(a.inicio)}</b>
                      <span className="flex-1 truncate text-[15px]">{a.cliente_nome}</span>
                      <span className="hidden truncate text-sm sm:block xl:hidden 2xl:block">{a.servicos_txt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {aberto ? (
        <Atendimento
          atendimento={aberto}
          aoFechar={() => setAberto(null)}
          aoMudou={() => recarregarTudo()}
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
      {bloqueando ? <Bloquear dataInicial={data} aoFechar={() => setBloqueando(false)} aoSalvo={() => recarregarTudo()} /> : null}
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
    </Pagina>
  );
}

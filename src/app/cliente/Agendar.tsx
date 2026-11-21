import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ErroApi, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Calendario } from "../componentes/Calendario";
import { Carregando } from "../componentes/Carregando";
import { Folha } from "../componentes/Folha";
import { Logo } from "../componentes/Logo";
import { Turnstile } from "../componentes/Turnstile";
import { Linhas } from "../componentes/Topo";
import { buscarInfo, useCarregar, type Info } from "../hooks";
import { normalizarTelefone } from "../../shared/telefone";
import { diaSemanaDe } from "../../shared/tempo";
import {
  dataDe,
  diaExtenso,
  horaDe,
  horaAbertura,
  noDiaAbertura,
  duracao,
  iniciais,
  mascararTelefone,
  reais,
} from "../util";
import { guardarMeuHorario, proximosHorarios } from "./meusHorarios";
import { guardarReserva, type Reserva } from "./Pronto";

type RespostaAgendar = {
  id: string;
  inicio: string;
  fim: string;
  servicos_txt: string;
  preco_centavos: number;
  barbeiro: string;
  tokenCliente: string;
};

const GRUPOS = [
  { nome: "Manhã", cabe: (min: number) => min < 12 * 60 },
  { nome: "Tarde", cabe: (min: number) => min >= 12 * 60 && min < 18 * 60 },
  { nome: "Noite", cabe: (min: number) => min >= 18 * 60 },
];
const minutosDe = (hora: string) => {
  const [h = 0, m = 0] = hora.split(":").map(Number);
  return h * 60 + m;
};

export default function Agendar() {
  const {
    dados: info,
    erro,
    carregando,
    recarregar,
  } = useCarregar(() => buscarInfo(true), []);

  if (carregando && !info) return <Carregando />;
  if (!info) {
    return (
      <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 px-5 pt-10">
        <Logo tamanho={120} />
        <Aviso>{erro ?? "Não foi possível carregar."}</Aviso>
        <Botao onClick={() => void recarregar()}>Tentar de novo</Botao>
      </div>
    );
  }
  return <Fluxo info={info} />;
}

/** Horários marcados neste aparelho, cada um com o link para ver ou cancelar. */
function SeusHorarios() {
  const [lista] = useState(() => proximosHorarios());
  if (lista.length === 0) return null;
  return (
    <section aria-label="Seus horários" className="cartao flex flex-col gap-2 p-3.5">
      <h2 className="bebas text-[22px] leading-none">Seus horários</h2>
      {lista.map((h) => (
        <Link
          key={h.token}
          to={`/meu-horario/${h.token}`}
          className="flex items-center justify-between gap-3 rounded-lg bg-superficie-alta px-3 py-2.5 text-sm"
        >
          <span>
            <b className="font-semibold">
              {diaExtenso(dataDe(h.inicio))} às {horaDe(h.inicio)}
            </b>
            <span className="block text-texto-suave">{h.servicos_txt}</span>
          </span>
          <span aria-hidden="true" className="text-ouro">
            ›
          </span>
        </Link>
      ))}
    </section>
  );
}

function Fluxo({ info }: { info: Info }) {
  const navegar = useNavigate();
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [barbeiro, setBarbeiro] = useState<string | null>(null);
  const primeiroMes = (info.dias[0] ?? "").slice(0, 7);
  const ultimoMes = (info.dias[info.dias.length - 1] ?? "").slice(0, 7);
  const [mes, setMes] = useState(primeiroMes);
  const [data, setData] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const servicos = info.servicos.filter((s) => escolhidos.includes(s.id));
  const totalMin = servicos.reduce((s, x) => s + x.duracao_min, 0);
  const totalPreco = servicos.reduce((s, x) => s + x.preco_centavos, 0);
  const nomeServicos = servicos.map((s) => s.nome).join(" + ");
  const chaveServicos = escolhidos.join(",");

  const vagas = useCarregar(
    () =>
      barbeiro && data && etapa === 2
        ? api<{ horarios: string[] }>(
            `/api/publico/vagas?barbeiro=${encodeURIComponent(barbeiro)}&data=${data}&servicos=${encodeURIComponent(chaveServicos)}`,
          )
        : Promise.resolve({ horarios: [] as string[] }),
    [barbeiro, data, chaveServicos, etapa],
  );

  const escolher = (id: string) => setEscolhidos([id]);

  const escolherBarbeiro = (id: string) => {
    setBarbeiro(id);
    setHora(null);
  };
  const escolherData = (d: string) => {
    setData(d);
    setHora(null);
    setAviso(null);
  };

  const sabadoLimite = info.dias[info.dias.length - 1];
  const grupos = useMemo(() => {
    const horarios = vagas.dados?.horarios ?? [];
    return GRUPOS.map((g) => ({
      ...g,
      itens: horarios.filter((h) => g.cabe(minutosDe(h))),
    })).filter((g) => g.itens.length);
  }, [vagas.dados]);

  const barbeiroNome =
    info.barbeiros.find((b) => b.id === barbeiro)?.nome ?? "";

  if (etapa === 1) {
    return (
      <div className="mx-auto max-w-[480px] pb-10 lg:max-w-xl">
        <div className="flex flex-col items-center gap-2.5 pt-[30px]">
          <Logo
            tamanho={170}
            className="shadow-[0_0_40px_rgba(208,184,72,0.25)]"
          />
          <p className="text-center text-[15px] text-texto">
            Escolha seu horário e a gente te espera ✂️
          </p>
          {info.barbearia.endereco ? (
            <p className="text-[13px] text-texto-suave">
              {info.barbearia.endereco}
            </p>
          ) : null}
        </div>
        <div className="mt-[18px] flex flex-col gap-3 px-5">
          <SeusHorarios />
          <h1 className="bebas text-[34px]">Agende seu horário</h1>
          <p className="-mt-1.5 text-[15px] text-texto-suave">
            Escolha um serviço.
          </p>
          {info.servicos.length === 0 ? (
            <Aviso tipo="info">Nenhum serviço disponível no momento.</Aviso>
          ) : null}
          <div
            role="radiogroup"
            aria-label="Serviço"
            className="flex flex-col gap-2.5"
          >
            {info.servicos.map((s) => {
              const on = escolhidos.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => escolher(s.id)}
                  className={`flex items-center gap-3.5 rounded-[14px] bg-superficie px-4 py-[15px] text-left ${on ? "border-2 border-ouro" : "border border-borda"}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${on ? "bg-ouro text-fundo" : "border border-borda bg-superficie-alta"}`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[17px] font-semibold">
                      {s.nome}
                    </span>
                    <span className="block text-sm text-texto-suave">
                      {duracao(s.duracao_min)}
                    </span>
                  </span>
                  <b className="text-[17px] text-ouro">
                    {reais(s.preco_centavos)}
                  </b>
                </button>
              );
            })}
          </div>
          <p className="text-[15px] text-texto-suave">
            {servicos.length === 1 ? `${nomeServicos} · ` : ""}
            {duracao(totalMin)} ·{" "}
            <b className="text-texto">{reais(totalPreco)}</b>
          </p>
          <Botao disabled={escolhidos.length === 0} onClick={() => setEtapa(2)}>
            Continuar
          </Botao>
          <Link
            to="/privacidade"
            className="text-center text-[13px] text-texto-suave underline"
          >
            Aviso de privacidade
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[480px] pb-10 lg:max-w-5xl">
      <header className="flex items-center gap-3 px-5 pb-3 pt-[18px] lg:px-8 lg:pt-8">
        <button
          type="button"
          aria-label="Voltar"
          onClick={() => setEtapa(1)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-superficie-alta text-xl font-bold"
        >
          ←
        </button>
        <h1 className="bebas flex-1 text-[28px] leading-none">
          Escolha o horário
        </h1>
        <Logo tamanho={48} />
      </header>

      <div className="flex flex-col gap-3.5 px-5 lg:px-8">
        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <div className="cartao flex items-center gap-2.5 px-3.5 py-3">
          <span className="text-ouro">✂</span>
          <b className="flex-1 text-[15px] font-semibold">
            {nomeServicos} · {duracao(totalMin)}
          </b>
          <button
            type="button"
            onClick={() => setEtapa(1)}
            className="text-sm font-semibold text-ouro"
          >
            Alterar
          </button>
        </div>

        <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
          <div className="flex flex-col gap-3.5">
            <h2 className="text-[17px] font-bold">Escolha o barbeiro</h2>
            <div className="flex flex-wrap gap-6">
              {info.barbeiros.map((b) => {
                const on = b.id === barbeiro;
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => escolherBarbeiro(b.id)}
                    className="flex flex-col items-center"
                  >
                    <span
                      className={`bebas flex h-[72px] w-[72px] items-center justify-center rounded-full bg-superficie-alta text-[28px] ${on ? "border-[3px] border-ouro text-ouro" : "border border-borda"}`}
                    >
                      {iniciais(b.nome)}
                    </span>
                    <span
                      className={`mt-1.5 text-sm ${on ? "font-bold text-ouro" : "font-medium"}`}
                    >
                      {b.nome}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="cartao px-2.5 py-3.5">
              <Calendario
                mes={mes}
                diasHabilitados={info.dias}
                selecionado={data}
                riscados={(d) => diaSemanaDe(d) === 0}
                aoEscolher={escolherData}
                aoMudarMes={setMes}
                mesMinimo={primeiroMes}
                mesMaximo={ultimoMes}
              />
              {sabadoLimite ? (
                <div className="mt-2 rounded-[10px] bg-superficie-alta px-3 py-2.5 text-[13px]">
                  <b className="font-semibold">
                    Agenda aberta até {diaExtenso(sabadoLimite, true)}.
                  </b>
                  <div className="text-texto-suave">
                    A próxima semana (seg a sáb) abre {noDiaAbertura(info.abertura.dia)} às {horaAbertura(info.abertura.minuto)}.
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            {data ? (
              <>
                <h2 className="text-[17px] font-bold">
                  {diaExtenso(data)} · horários livres
                </h2>
                {!barbeiro ? (
                  <Aviso tipo="info">
                    Escolha o barbeiro para ver os horários.
                  </Aviso>
                ) : vagas.carregando ? (
                  <Carregando />
                ) : vagas.erro ? (
                  <Aviso>{vagas.erro}</Aviso>
                ) : grupos.length === 0 ? (
                  <Aviso tipo="info">
                    Sem horários livres neste dia. Escolha outro dia.
                  </Aviso>
                ) : (
                  grupos.map((g) => (
                    <div key={g.nome} className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <b className="text-[15px] font-semibold">{g.nome}</b>
                        <span className="h-px flex-1 bg-borda" />
                        <span className="text-xs text-texto-suave">
                          {g.itens.length}{" "}
                          {g.itens.length === 1 ? "horário" : "horários"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2.5">
                        {g.itens.map((h) => (
                          <button
                            key={h}
                            type="button"
                            aria-pressed={h === hora}
                            onClick={() => setHora(h)}
                            className={`flex h-12 items-center justify-center rounded-[10px] border text-base font-semibold ${h === hora ? "border-ouro bg-ouro text-fundo" : "border-borda bg-superficie"}`}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </>
            ) : (
              <p className="text-sm text-texto-suave">
                Escolha um dia para ver os horários livres.
              </p>
            )}
          </div>
        </div>
      </div>

      {data && hora && barbeiro ? (
        <Confirmar
          info={info}
          resumo={[
            ["Serviço", `${nomeServicos} (${duracao(totalMin)})`],
            ["Barbeiro", barbeiroNome],
            ["Quando", `${diaExtenso(data)} às ${hora}`],
            ["Valor", reais(totalPreco)],
          ]}
          corpo={{ barbeiro, servicos: escolhidos, data, hora }}
          aoFechar={() => setHora(null)}
          aoConflito={(msg) => {
            setAviso(msg);
            setHora(null);
            void vagas.recarregar();
          }}
          aoSucesso={(r) => {
            const reserva: Reserva = {
              ...r,
              barbearia: info.barbearia.nome || "Barbearia dos Padilhas",
              whatsapp: info.barbearia.whatsapp,
              endereco: info.barbearia.endereco,
            };
            guardarReserva(reserva);
            guardarMeuHorario({
              token: r.tokenCliente,
              inicio: r.inicio,
              servicos_txt: r.servicos_txt,
              barbeiro: r.barbeiro,
            });
            navegar(`/pronto/${r.id}`, { state: { reserva }, replace: true });
          }}
        />
      ) : null}
    </div>
  );
}

function Confirmar({
  info,
  resumo,
  corpo,
  aoFechar,
  aoConflito,
  aoSucesso,
}: {
  info: Info;
  resumo: [string, string][];
  corpo: { barbeiro: string; servicos: string[]; data: string; hora: string };
  aoFechar: () => void;
  aoConflito: (mensagem: string) => void;
  aoSucesso: (r: RespostaAgendar) => void;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [aceite, setAceite] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [reiniciar, setReiniciar] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const indisponivel = !info.turnstileSiteKey;

  const aoToken = useCallback((t: string | null) => setToken(t), []);
  useEffect(() => {
    setErro(null);
  }, [nome, telefone, aceite]);

  async function enviar() {
    if (!nome.trim()) return setErro("Informe seu nome.");
    if (!normalizarTelefone(telefone))
      return setErro("Informe um celular com DDD válido.");
    if (!aceite) return setErro("Marque a caixinha para continuar.");
    if (!token) return setErro("Aguarde a verificação anti-robô terminar.");
    setEnviando(true);
    setErro(null);
    try {
      const r = await api<RespostaAgendar>("/api/publico/agendar", {
        corpo: {
          ...corpo,
          nome: nome.trim(),
          telefone,
          aceite: true,
          turnstile: token,
        },
      });
      aoSucesso(r);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 409) {
        aoConflito(e.mensagem);
        return;
      }
      setErro(mensagemDe(e));
      setToken(null);
      setReiniciar((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha aberta aoFechar={aoFechar} rotulo="Confirme seu horário">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Logo tamanho={52} />
          <div>
            <h2 className="bebas text-[28px] leading-none">
              Confirme seu horário
            </h2>
            <p className="text-sm text-texto-suave">
              Falta só seu nome e telefone
            </p>
          </div>
        </div>
        <Linhas
          className="rounded-xl bg-superficie-alta px-4 py-3.5 text-sm"
          itens={resumo}
        />
        <div>
          <label className="rotulo block" htmlFor="nome">
            Seu nome
          </label>
          <input
            id="nome"
            className="campo"
            autoComplete="name"
            maxLength={60}
            placeholder="João Silva"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div>
          <label className="rotulo block" htmlFor="celular">
            Celular (WhatsApp)
          </label>
          <input
            id="celular"
            className="campo"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(48) 99999-1234"
            value={telefone}
            onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
          />
        </div>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-ouro"
          />
          <span className="text-[13px] text-texto-suave">
            Aceito receber mensagens no WhatsApp sobre meu horário.{" "}
            <Link
              to="/privacidade"
              target="_blank"
              className="text-ouro underline"
            >
              Ver aviso de privacidade
            </Link>
            .
          </span>
        </label>
        {indisponivel ? (
          <Aviso>Agendamento temporariamente indisponível.</Aviso>
        ) : (
          <Turnstile
            chave={info.turnstileSiteKey}
            aoToken={aoToken}
            reiniciar={reiniciar}
          />
        )}
        {erro ? <Aviso>{erro}</Aviso> : null}
        <Botao
          disabled={indisponivel || enviando}
          onClick={() => void enviar()}
        >
          {enviando ? "Confirmando…" : "Confirmar horário"}
        </Botao>
      </div>
    </Folha>
  );
}

import { useEffect, useState } from "react";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Chave } from "../componentes/Topo";
import { Pagina } from "../componentes/Pagina";
import { useCarregar } from "../hooks";
import { useSessao } from "../sessao";
import { hhmm } from "../../shared/tempo";
import { ddmm, dataDe, diaCurto, hojeLocal, horaDe, somarDias } from "../util";
import Bloquear from "./Bloquear";
import { useBarbeiros } from "./MarcarCliente";
import type { Bloq } from "./tipos";

type Dia = {
  dia_semana: number;
  aberto: boolean | number;
  inicio_min: number;
  fim_min: number;
  almoco_ini_min: number | null;
  almoco_fim_min: number | null;
};
type MembroEquipe = {
  id: string;
  nome: string;
  usuario: string;
  papel: string;
  ativo: number | boolean;
};

const ORDEM = [1, 2, 3, 4, 5, 6, 0];

const paraMin = (hora: string): number | null => {
  if (!/^\d{2}:\d{2}$/.test(hora)) return null;
  const [h = 0, m = 0] = hora.split(":").map(Number);
  return h * 60 + m;
};
const hora12 = (min: number) => (min % 60 === 0 ? `${min / 60}h` : hhmm(min));

function resumoDia(d: Dia): string {
  if (!d.aberto) return "Fechado";
  const base = `${hhmm(d.inicio_min)} – ${hhmm(d.fim_min)}`;
  if (d.almoco_ini_min === null || d.almoco_fim_min === null) return base;
  const dur = d.almoco_fim_min - d.almoco_ini_min;
  return dur === 60
    ? `${base} · almoço ${hora12(d.almoco_ini_min)}`
    : `${base} · almoço ${hhmm(d.almoco_ini_min)}–${hhmm(d.almoco_fim_min)}`;
}

function partesDia(d: Dia): { horario: string; almoco: string } {
  if (!d.aberto) return { horario: "Fechado", almoco: "—" };
  const horario = `${hhmm(d.inicio_min)} – ${hhmm(d.fim_min)}`;
  if (d.almoco_ini_min === null || d.almoco_fim_min === null) return { horario, almoco: "Sem almoço" };
  const dur = d.almoco_fim_min - d.almoco_ini_min;
  return {
    horario,
    almoco: dur === 60 ? `Almoço ${hora12(d.almoco_ini_min)}` : `Almoço ${hhmm(d.almoco_ini_min)}–${hhmm(d.almoco_fim_min)}`,
  };
}

function periodoBloqueio(b: Bloq): string {
  const minutos = (new Date(b.fim).getTime() - new Date(b.inicio).getTime()) / 60_000;
  if (minutos >= 1440) return b.motivo || "Dia fechado";
  const quando = dataDe(b.fim) !== dataDe(b.inicio) ? `a partir das ${horaDe(b.inicio)}` : `${horaDe(b.inicio)} – ${horaDe(b.fim)}`;
  return b.motivo ? `${b.motivo} · ${quando}` : quando;
}

export default function Horarios() {
  const eu = useSessao();
  const dono = eu.papel === "dono";
  const fallback = useBarbeiros();
  const equipe = useCarregar(() => (dono ? api<{ equipe: MembroEquipe[] }>("/api/equipe") : Promise.resolve({ equipe: [] })), [dono]);
  const barbeiros = dono
    ? (equipe.dados?.equipe.filter((m) => m.ativo).map((m) => ({ id: m.id, nome: m.nome })) ?? fallback)
    : [{ id: eu.id, nome: eu.nome }];
  const [usuarioId, setUsuarioId] = useState(eu.id);

  const expediente = useCarregar(() => api<{ dias: Dia[] }>(`/api/expediente?usuarioId=${encodeURIComponent(usuarioId)}`), [usuarioId]);
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [sujo, setSujo] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fechando, setFechando] = useState(false);

  useEffect(() => {
    if (expediente.dados) {
      setDias(expediente.dados.dias.map((d) => ({ ...d, aberto: !!d.aberto })));
      setSujo(false);
      setAberto(null);
    }
  }, [expediente.dados]);

  const hoje = hojeLocal();
  const folgas = useCarregar(() => api<{ bloqueios: Bloq[] }>(`/api/bloqueios?de=${hoje}&ate=${somarDias(hoje, 92)}`), [hoje]);
  const nomeDe = (id: string | null) =>
    id === null ? "Barbearia toda" : `Só ${barbeiros.find((b) => b.id === id)?.nome ?? (id === eu.id ? eu.nome : "outro barbeiro")}`;

  const mudar = (dia: number, parte: Partial<Dia>) => {
    setDias((atual) => (atual ? atual.map((d) => (d.dia_semana === dia ? { ...d, ...parte } : d)) : atual));
    setSujo(true);
  };

  async function salvar() {
    if (!dias) return;
    for (const d of dias) {
      if (d.aberto && d.fim_min <= d.inicio_min) return setErro(`${diaCurto(d.dia_semana)}: o fim precisa ser depois do início.`);
      if ((d.almoco_ini_min === null) !== (d.almoco_fim_min === null))
        return setErro(`${diaCurto(d.dia_semana)}: preencha o início e o fim do almoço.`);
    }
    setSalvando(true);
    setErro(null);
    try {
      await api(`/api/expediente/${encodeURIComponent(usuarioId)}`, {
        metodo: "PUT",
        corpo: { dias: dias.map((d) => ({ ...d, aberto: !!d.aberto })) },
      });
      await expediente.recarregar();
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(b: Bloq) {
    setErro(null);
    try {
      await api(`/api/bloqueios/${b.id}`, { metodo: "DELETE" });
      await folgas.recarregar();
    } catch (e) {
      setErro(mensagemDe(e));
    }
  }

  return (
    <Pagina
      titulo="Horários e folgas"
      sub={dono ? "Quando a barbearia abre" : "Seus horários"}
      acoes={
        <>
          {dono && sujo ? (
            <Botao compacto disabled={salvando} onClick={() => void salvar()}>
              {salvando ? "Salvando…" : "Salvar horários"}
            </Botao>
          ) : null}
          <Botao compacto variante="secundario" onClick={() => setFechando(true)}>
            + Fechar um dia
          </Botao>
        </>
      }
    >
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-3">
          {dono && barbeiros.length > 1 ? (
            <div className="flex flex-wrap gap-2 text-sm font-semibold" role="group" aria-label="Barbeiro">
              {barbeiros.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={b.id === usuarioId}
                  onClick={() => {
                    setDias(null);
                    setUsuarioId(b.id);
                  }}
                  className={`rounded-full px-4 py-2 ${b.id === usuarioId ? "bg-ouro text-fundo" : "bg-superficie-alta"}`}
                >
                  {b.nome}
                </button>
              ))}
            </div>
          ) : null}

          {expediente.erro ? <Aviso>{expediente.erro}</Aviso> : null}
          {!dias && expediente.carregando ? <Carregando /> : null}
          {dias ? (
            <div className="cartao overflow-hidden">
              <div className="hidden grid-cols-[64px_minmax(0,1.2fr)_minmax(0,1fr)_50px] gap-4 border-b border-borda px-5 py-3 text-xs font-semibold uppercase tracking-wider text-texto-suave md:grid">
                <span>Dia</span>
                <span>Horário</span>
                <span>Almoço</span>
                <span />
              </div>
              {ORDEM.map((n) => {
                const d = dias.find((x) => x.dia_semana === n);
                if (!d) return null;
                const aberta = !!d.aberto;
                const expandido = dono && aberto === n && aberta;
                const partes = partesDia(d);
                return (
                  <div key={n} className="border-b border-borda px-5 py-3 last:border-b-0">
                    <div className="flex items-center gap-3 md:grid md:grid-cols-[64px_minmax(0,1.2fr)_minmax(0,1fr)_50px] md:gap-4">
                      <b className="w-10 text-sm md:w-auto">{diaCurto(n)}</b>
                      <button
                        type="button"
                        disabled={!dono || !aberta}
                        onClick={() => setAberto(expandido ? null : n)}
                        className={`flex-1 text-left text-sm ${aberta ? "text-texto" : "text-apagado"}`}
                      >
                        <span className="md:hidden">{resumoDia(d)}</span>
                        <span className="hidden md:inline">{partes.horario}</span>
                      </button>
                      <span className={`hidden text-sm md:block ${aberta ? "text-texto-suave" : "text-apagado"}`}>{partes.almoco}</span>
                      <div className="md:flex md:justify-end">
                        <Chave
                          ligada={aberta}
                          rotulo={`${diaCurto(n)} aberto`}
                          aoMudar={dono ? (v) => mudar(n, { aberto: v }) : undefined}
                        />
                      </div>
                    </div>
                    {expandido ? (
                      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-superficie-alta p-3.5 md:grid-cols-4">
                        {(
                          [
                            ["Abre", "inicio_min"],
                            ["Fecha", "fim_min"],
                            ["Almoço começa", "almoco_ini_min"],
                            ["Almoço termina", "almoco_fim_min"],
                          ] as const
                        ).map(([rotulo, campo]) => (
                          <div key={campo}>
                            <label className="mb-1 block text-xs text-texto-suave" htmlFor={`${campo}-${n}`}>
                              {rotulo}
                            </label>
                            <input
                              id={`${campo}-${n}`}
                              type="time"
                              className="campo !p-2.5"
                              value={d[campo] === null ? "" : hhmm(d[campo])}
                              onChange={(e) => {
                                const v = paraMin(e.target.value);
                                if (v !== null || campo.startsWith("almoco")) mudar(n, { [campo]: v } as Partial<Dia>);
                              }}
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          className="col-span-2 text-left text-[13px] font-semibold text-ouro md:col-span-4"
                          onClick={() =>
                            mudar(n, {
                              almoco_ini_min: null,
                              almoco_fim_min: null,
                            })
                          }
                        >
                          Sem almoço neste dia
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {dono && sujo ? (
            <Botao className="lg:hidden" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? "Salvando…" : "Salvar horários"}
            </Botao>
          ) : null}
          {!dono ? <p className="text-xs text-texto-suave">Só o dono muda o horário de funcionamento.</p> : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="cartao flex flex-col gap-3 p-5">
            <b className="text-base">Dias fechados e folgas</b>
            {folgas.erro ? <Aviso>{folgas.erro}</Aviso> : null}
            {folgas.dados && folgas.dados.bloqueios.length === 0 ? (
              <p className="text-[13px] text-texto-suave">Nenhuma folga marcada pelos próximos 3 meses.</p>
            ) : null}
            {(folgas.dados?.bloqueios ?? []).map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <span className="pilula text-ouro">{ddmm(dataDe(b.inicio))}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{periodoBloqueio(b)}</div>
                  <div className="text-xs text-texto-suave">{nomeDe(b.usuario_id)}</div>
                </div>
                {dono || b.usuario_id === eu.id ? (
                  <button type="button" aria-label="Remover" onClick={() => void remover(b)} className="px-2 text-lg text-texto-suave">
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {erro ? <Aviso>{erro}</Aviso> : null}
          <p className="text-xs text-texto-suave">
            Os clientes marcam de segunda a sábado da semana atual. A semana seguinte abre no sábado às 23h.
          </p>
        </div>
      </div>

      {fechando ? (
        <Bloquear
          titulo="Fechar um dia"
          dataInicial={somarDias(hoje, 1)}
          diaInteiroInicial
          aoFechar={() => setFechando(false)}
          aoSalvo={() => {
            setFechando(false);
            void folgas.recarregar();
          }}
        />
      ) : null}
    </Pagina>
  );
}

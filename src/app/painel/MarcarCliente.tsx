import { useEffect, useState } from "react";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Folha } from "../componentes/Folha";
import { buscarInfo, type Info } from "../hooks";
import { normalizarTelefone } from "../../shared/telefone";
import { useSessao } from "../sessao";
import { dataDe, duracao, horaDe, mascararTelefone, reais } from "../util";
import type { Atend } from "./tipos";

export const TEXTO_AVISO: Record<string, string> = {
  fora_do_expediente: "Fora do seu horário",
  horario_bloqueado: "Horário bloqueado",
  no_passado: "Data no passado",
};

/** Barbeiros que o dono pode escolher (os da vitrine mais ele mesmo). */
export function useBarbeiros(): { id: string; nome: string }[] {
  const eu = useSessao();
  const [lista, setLista] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => {
    let vivo = true;
    buscarInfo()
      .then((i) => vivo && setLista(i.barbeiros))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return lista.some((b) => b.id === eu.id) ? lista : [{ id: eu.id, nome: eu.nome }, ...lista];
}

export function SeletorBarbeiro({
  valor,
  aoMudar,
  opcoes,
  extra,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: { id: string; nome: string }[];
  extra?: { id: string; nome: string }[];
}) {
  return (
    <div>
      <label className="rotulo block" htmlFor="barbeiro">
        Barbeiro
      </label>
      <select id="barbeiro" className="campo" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {[...opcoes, ...(extra ?? [])].map((b) => (
          <option key={b.id} value={b.id}>
            {b.nome}
          </option>
        ))}
      </select>
    </div>
  );
}

type RespostaMarcar = Atend | { avisos: string[] };

/** Folha de "Marcar cliente" (ou, com `remarcar`, de remarcar um atendimento). */
export default function MarcarCliente({
  aoFechar,
  aoSalvo,
  dataInicial,
  remarcar,
}: {
  aoFechar: () => void;
  aoSalvo: () => void;
  dataInicial: string;
  remarcar?: Atend;
}) {
  const eu = useSessao();
  const dono = eu.papel === "dono";
  const barbeiros = useBarbeiros();
  const [info, setInfo] = useState<Info | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [usuarioId, setUsuarioId] = useState(remarcar?.usuario_id ?? eu.id);
  const [data, setData] = useState(remarcar ? dataDe(remarcar.inicio) : dataInicial);
  const [hora, setHora] = useState(remarcar ? horaDe(remarcar.inicio) : "09:00");
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (remarcar) return;
    let vivo = true;
    buscarInfo()
      .then((i) => vivo && setInfo(i))
      .catch((e) => vivo && setErro(mensagemDe(e)));
    return () => {
      vivo = false;
    };
  }, [remarcar]);

  const alternar = (id: string) =>
    setEscolhidos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  async function enviar(confirmarAvisos: boolean) {
    setErro(null);
    if (!data || !hora) return setErro("Informe o dia e a hora.");
    setEnviando(true);
    try {
      if (remarcar) {
        await api(`/api/atendimentos/${remarcar.id}/remarcar`, {
          metodo: "PATCH",
          corpo: { data, hora, ...(dono ? { usuarioId } : {}) },
        });
        aoSalvo();
        return;
      }
      if (!nome.trim()) return setErro("Informe o nome do cliente.");
      if (escolhidos.length === 0) return setErro("Escolha pelo menos um serviço.");
      if (telefone.trim() && !normalizarTelefone(telefone)) return setErro("Informe um celular com DDD válido.");
      const r = await api<RespostaMarcar>("/api/atendimentos", {
        corpo: {
          nome: nome.trim(),
          ...(telefone.trim() ? { telefone } : {}),
          servicos: escolhidos,
          ...(dono ? { usuarioId } : {}),
          data,
          hora,
          ...(confirmarAvisos ? { confirmarAvisos: true } : {}),
        },
      });
      if ("avisos" in r) {
        setAvisos(r.avisos);
        return;
      }
      aoSalvo();
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  const titulo = remarcar ? "Remarcar" : "Marcar cliente";
  return (
    <Folha aberta aoFechar={aoFechar} rotulo={titulo}>
      <div className="flex flex-col gap-4">
        <h2 className="bebas text-[28px] leading-none">{titulo}</h2>
        {remarcar ? (
          <p className="text-[15px] text-texto-suave">
            {remarcar.cliente_nome} · {remarcar.servicos_txt}
          </p>
        ) : null}

        {!remarcar ? (
          <>
            <div>
              <label className="rotulo block" htmlFor="m-nome">
                Nome do cliente
              </label>
              <input id="m-nome" className="campo" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <label className="rotulo block" htmlFor="m-tel">
                Celular (opcional)
              </label>
              <input
                id="m-tel"
                className="campo"
                type="tel"
                inputMode="numeric"
                placeholder="(48) 99999-1234"
                value={telefone}
                onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
              />
            </div>
            <div>
              <div className="rotulo">Serviços</div>
              {!info ? (
                erro ? null : <Carregando />
              ) : (
                <div className="flex flex-col gap-2">
                  {info.servicos.map((s) => {
                    const on = escolhidos.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => alternar(s.id)}
                        className={`flex items-center gap-3 rounded-xl bg-superficie-alta px-3.5 py-3 text-left ${on ? "border-2 border-ouro" : "border border-borda"}`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${on ? "bg-ouro text-fundo" : "border border-borda bg-fundo"}`}
                        >
                          {on ? "✓" : ""}
                        </span>
                        <span className="flex-1 text-[15px] font-semibold">
                          {s.nome} <span className="font-normal text-texto-suave">· {duracao(s.duracao_min)}</span>
                        </span>
                        <b className="text-sm text-ouro">{reais(s.preco_centavos)}</b>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}

        {dono ? <SeletorBarbeiro valor={usuarioId} aoMudar={setUsuarioId} opcoes={barbeiros} /> : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="rotulo block" htmlFor="m-data">
              Dia
            </label>
            <input id="m-data" className="campo" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <label className="rotulo block" htmlFor="m-hora">
              Hora
            </label>
            <input id="m-hora" className="campo" type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>

        {avisos ? (
          <div className="flex flex-col gap-2 rounded-[10px] border border-ouro/60 bg-ouro/10 p-3.5">
            {avisos.map((a) => (
              <b key={a} className="text-[15px] text-ouro">
                {TEXTO_AVISO[a] ?? a}
              </b>
            ))}
            <p className="text-[15px]">Marcar mesmo assim?</p>
            <div className="flex gap-2">
              <Botao pequeno disabled={enviando} onClick={() => void enviar(true)}>
                Marcar mesmo assim
              </Botao>
              <Botao pequeno variante="secundario" onClick={() => setAvisos(null)}>
                Voltar
              </Botao>
            </div>
          </div>
        ) : null}
        {erro ? <Aviso>{erro}</Aviso> : null}

        {!avisos ? (
          <Botao disabled={enviando} onClick={() => void enviar(false)}>
            {enviando ? "Salvando…" : remarcar ? "Remarcar" : "Marcar"}
          </Botao>
        ) : null}
      </div>
    </Folha>
  );
}

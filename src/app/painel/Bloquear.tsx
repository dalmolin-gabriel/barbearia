import { useState } from "react";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Folha } from "../componentes/Folha";
import { Chave } from "../componentes/Topo";
import { useSessao } from "../sessao";
import { useBarbeiros } from "./MarcarCliente";

const TODA = "__toda__";

/** Folha para bloquear um horário ou fechar um dia (folga, feriado, almoço longo). */
export default function Bloquear({
  aoFechar,
  aoSalvo,
  dataInicial,
  diaInteiroInicial = false,
  titulo = "Bloquear horário",
}: {
  aoFechar: () => void;
  aoSalvo: () => void;
  dataInicial: string;
  diaInteiroInicial?: boolean;
  titulo?: string;
}) {
  const eu = useSessao();
  const dono = eu.papel === "dono";
  const barbeiros = useBarbeiros();
  const [quem, setQuem] = useState(eu.id);
  const [data, setData] = useState(dataInicial);
  const [diaInteiro, setDiaInteiro] = useState(diaInteiroInicial);
  const [horaIni, setHoraIni] = useState("12:00");
  const [horaFim, setHoraFim] = useState("13:00");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setErro(null);
    if (!data) return setErro("Informe o dia.");
    if (!diaInteiro && (!horaIni || (horaFim && horaFim <= horaIni))) return setErro("A hora final precisa ser depois da inicial.");
    setEnviando(true);
    try {
      await api("/api/bloqueios", {
        corpo: {
          ...(dono ? { usuarioId: quem === TODA ? null : quem } : {}),
          data,
          ...(diaInteiro ? { diaInteiro: true } : { horaIni, ...(horaFim ? { horaFim } : {}) }),
          motivo: motivo.trim(),
        },
      });
      aoSalvo();
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha aberta aoFechar={aoFechar} rotulo={titulo}>
      <div className="flex flex-col gap-4">
        <h2 className="bebas text-[28px] leading-none">{titulo}</h2>
        {dono ? (
          <div>
            <label className="rotulo block" htmlFor="b-quem">
              Quem
            </label>
            <select id="b-quem" className="campo" value={quem} onChange={(e) => setQuem(e.target.value)}>
              <option value={TODA}>Barbearia toda</option>
              {barbeiros.map((b) => (
                <option key={b.id} value={b.id}>
                  Só {b.nome}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="rotulo block" htmlFor="b-data">
            Dia
          </label>
          <input id="b-data" className="campo" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold">Dia inteiro</span>
          <Chave ligada={diaInteiro} aoMudar={setDiaInteiro} rotulo="Dia inteiro" />
        </div>
        {!diaInteiro ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="rotulo block" htmlFor="b-ini">
                Das
              </label>
              <input id="b-ini" className="campo" type="time" step={300} value={horaIni} onChange={(e) => setHoraIni(e.target.value)} />
            </div>
            <div>
              <label className="rotulo block" htmlFor="b-fim">
                Às
              </label>
              <input id="b-fim" className="campo" type="time" step={300} value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
            </div>
          </div>
        ) : null}
        <div>
          <label className="rotulo block" htmlFor="b-motivo">
            Motivo (opcional)
          </label>
          <input
            id="b-motivo"
            className="campo"
            maxLength={120}
            placeholder="Folga, feriado, médico…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        {erro ? <Aviso>{erro}</Aviso> : null}
        <Botao disabled={enviando} onClick={() => void salvar()}>
          {enviando ? "Salvando…" : "Bloquear"}
        </Botao>
      </div>
    </Folha>
  );
}

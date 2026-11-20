import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ErroApi, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Folha } from "../componentes/Folha";
import { Logo } from "../componentes/Logo";
import { Linhas } from "../componentes/Topo";
import { buscarInfo, useCarregar } from "../hooks";
import { dataDe, diaExtenso, horaDe, reais } from "../util";
import { esquecerMeuHorario } from "./meusHorarios";

type Horario = {
  id: string;
  servicos_txt: string;
  barbeiro: string;
  inicio: string;
  fim: string;
  preco_centavos: number;
  status: "marcado" | "confirmado" | "atendido" | "cancelado" | "faltou";
  podeCancelar: boolean;
  limiteCancelamento: string;
};

const ROTULO: Record<Horario["status"], { texto: string; classe: string }> = {
  marcado: { texto: "Marcado", classe: "border-ouro/50 bg-ouro/10 text-ouro" },
  confirmado: { texto: "Confirmado", classe: "border-ok/50 bg-ok/10 text-ok" },
  atendido: { texto: "Atendido", classe: "border-borda bg-superficie-alta text-texto-suave" },
  cancelado: { texto: "Cancelado", classe: "border-erro/50 bg-erro/10 text-erro" },
  faltou: { texto: "Faltou", classe: "border-borda bg-superficie-alta text-texto-suave" },
};

export default function MeuHorario() {
  const { token = "" } = useParams();
  const horario = useCarregar(() => api<Horario>(`/api/publico/meu-horario/${encodeURIComponent(token)}`), [token]);
  const info = useCarregar(() => buscarInfo(), []);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cancelado, setCancelado] = useState(false);

  const h = horario.dados;
  const whats = (info.dados?.barbearia.whatsapp ?? "").replace(/\D/g, "");

  if (horario.carregando && !h) return <Carregando />;

  const moldura = (filhos: React.ReactNode) => (
    <div className="mx-auto flex max-w-[480px] flex-col items-center gap-3.5 px-6 pb-10 pt-[34px] lg:max-w-xl">
      <Logo tamanho={120} />
      {filhos}
    </div>
  );

  if (!h) {
    return moldura(
      <>
        <h1 className="bebas text-[34px]">Horário não encontrado</h1>
        <p className="text-center text-texto-suave">
          {horario.erro === "Horário não encontrado."
            ? "Esse link não vale mais ou está incompleto. Se precisar, chame a gente no WhatsApp."
            : (horario.erro ?? "Não foi possível carregar.")}
        </p>
        <Link to="/" className="font-semibold text-ouro">
          Marcar um horário
        </Link>
      </>,
    );
  }

  async function cancelar() {
    setEnviando(true);
    setErro(null);
    try {
      await api<{ ok: true }>(`/api/publico/meu-horario/${encodeURIComponent(token)}/cancelar`, { metodo: "POST", corpo: {} });
      esquecerMeuHorario(token);
      setConfirmando(false);
      setCancelado(true);
    } catch (e) {
      setConfirmando(false);
      setErro(mensagemDe(e));
      if (e instanceof ErroApi && (e.status === 409 || e.status === 422)) {
        if (e.status === 409) esquecerMeuHorario(token);
        await horario.recarregar();
      }
    } finally {
      setEnviando(false);
    }
  }

  if (cancelado) {
    return moldura(
      <>
        <div
          aria-hidden="true"
          className="mt-2.5 flex h-20 w-20 items-center justify-center rounded-full bg-ouro/15 text-[38px] font-bold text-ouro"
        >
          ✓
        </div>
        <h1 className="bebas text-[34px] leading-none">Horário cancelado</h1>
        <p role="status" className="text-center text-base text-texto-suave">
          Horário cancelado. Quando quiser, é só marcar de novo.
        </p>
        <Link to="/" className="font-semibold text-ouro">
          Marcar outro horário
        </Link>
      </>,
    );
  }

  const ativo = h.status === "marcado" || h.status === "confirmado";
  const rotulo = ROTULO[h.status];
  return moldura(
    <>
      <h1 className="bebas text-[34px] leading-none">Seu horário</h1>
      <span className={`rounded-full border px-3 py-1 text-[13px] font-bold ${rotulo.classe}`}>{rotulo.texto}</span>
      <p className="text-center text-base text-texto-suave">
        {diaExtenso(dataDe(h.inicio))} às {horaDe(h.inicio)}
      </p>
      <Linhas
        className="cartao w-full p-4 text-sm"
        itens={[
          ["Serviço", h.servicos_txt],
          ["Barbeiro", h.barbeiro],
          ["Dia", diaExtenso(dataDe(h.inicio))],
          ["Hora", horaDe(h.inicio)],
          ["Valor", reais(h.preco_centavos)],
        ]}
      />
      {erro ? <Aviso>{erro}</Aviso> : null}

      {h.status === "cancelado" ? <p className="text-center text-texto-suave">Este horário foi cancelado.</p> : null}

      {ativo && h.podeCancelar ? (
        <Botao variante="perigo" onClick={() => setConfirmando(true)}>
          Cancelar horário
        </Botao>
      ) : null}

      {ativo && !h.podeCancelar ? (
        <>
          <Aviso tipo="info">
            Faltam menos de 2 horas para o seu horário, então o cancelamento por aqui já fechou. Se não puder vir, fale com a
            gente pelo WhatsApp.
          </Aviso>
          {whats ? (
            <BotaoLink variante="whatsapp" href={`https://wa.me/${whats}`} target="_blank" rel="noopener noreferrer">
              Falar no WhatsApp
            </BotaoLink>
          ) : null}
        </>
      ) : null}

      {ativo && h.podeCancelar ? (
        <p className="text-center text-[13px] text-texto-suave">Dá para cancelar até 2 horas antes do horário.</p>
      ) : null}

      <Link to="/" className="font-semibold text-ouro">
        {h.status === "cancelado" ? "Marcar outro horário" : "Voltar ao início"}
      </Link>

      <Folha aberta={confirmando} aoFechar={() => (enviando ? undefined : setConfirmando(false))} rotulo="Confirmar cancelamento">
        <h2 className="bebas text-[28px] leading-none">Cancelar horário?</h2>
        <p className="mt-2 text-[15px] text-texto-suave">Tem certeza? O horário fica livre para outra pessoa.</p>
        <div className="mt-5 flex flex-col gap-2.5">
          <Botao variante="perigo" disabled={enviando} onClick={() => void cancelar()}>
            {enviando ? "Cancelando…" : "Sim, cancelar"}
          </Botao>
          <Botao variante="secundario" disabled={enviando} onClick={() => setConfirmando(false)}>
            Voltar
          </Botao>
        </div>
      </Folha>
    </>,
  );
}

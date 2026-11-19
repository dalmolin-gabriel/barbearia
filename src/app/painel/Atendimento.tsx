import { useState } from "react";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Folha } from "../componentes/Folha";
import { Linhas } from "../componentes/Topo";
import { useNomeBarbearia } from "../hooks";
import { formatarTelefone } from "../../shared/telefone";
import { linkWhatsapp, textoLembrete } from "../../shared/mensagens";
import { ddmm, dataDe, hojeLocal, horaDe, primeiroNome, reais, somarDias } from "../util";
import { estaAtivo, ROTULO_SITUACAO, type Atend } from "./tipos";
import type { Situacao } from "../../shared/tipos";

export function linkLembrete(a: Atend, barbearia: string): string | null {
  if (!a.cliente_telefone) return null;
  const texto = textoLembrete({
    cliente: primeiroNome(a.cliente_nome),
    data: dataDe(a.inicio),
    hora: horaDe(a.inicio),
    servico: a.servicos_txt,
    barbeiro: a.barbeiro_nome,
    barbearia,
  });
  return linkWhatsapp(a.cliente_telefone, texto);
}

function quandoTexto(a: Atend): string {
  const d = dataDe(a.inicio);
  const hoje = hojeLocal();
  const rotulo = d === hoje ? "Hoje" : d === somarDias(hoje, 1) ? "Amanhã" : d === somarDias(hoje, -1) ? "Ontem" : null;
  const dia = rotulo ? `${rotulo}, ${ddmm(d)}` : ddmm(d);
  return `${dia} · ${horaDe(a.inicio)} – ${horaDe(a.fim)}`;
}

/** Folha com os detalhes e as ações de um atendimento. */
export default function Atendimento({
  atendimento: a,
  aoFechar,
  aoMudou,
  aoRemarcar,
}: {
  atendimento: Atend;
  aoFechar: () => void;
  aoMudou: () => void;
  aoRemarcar: (a: Atend) => void;
}) {
  const barbearia = useNomeBarbearia();
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ativo = estaAtivo(a);

  async function mudar(situacao: Situacao) {
    setOcupado(true);
    setErro(null);
    try {
      await api(`/api/atendimentos/${a.id}/situacao`, { metodo: "PATCH", corpo: { situacao } });
      aoMudou();
    } catch (e) {
      setErro(mensagemDe(e));
      setOcupado(false);
    }
  }

  const lembrete = linkLembrete(a, barbearia);
  const conversa = a.cliente_telefone ? `https://wa.me/${a.cliente_telefone}` : null;
  const criado = a.criado_em ? `${ddmm(dataDe(a.criado_em))} às ${horaDe(a.criado_em)}` : null;

  return (
    <Folha aberta aoFechar={aoFechar} rotulo="Atendimento">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <div className="bebas flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-superficie-alta text-[26px] text-ouro">
            {a.cliente_nome.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-bold">{a.cliente_nome}</div>
            <div className="text-sm text-texto-suave">
              {a.cliente_telefone ? formatarTelefone(a.cliente_telefone) : "Sem telefone"}
            </div>
          </div>
          <span className="pilula text-ouro">{ROTULO_SITUACAO[a.status]}</span>
        </div>

        <Linhas
          className="rounded-xl bg-superficie-alta p-3.5 text-[15px]"
          itens={[
            ["Serviço", a.servicos_txt],
            ["Quando", quandoTexto(a)],
            ["Barbeiro", a.barbeiro_nome],
            ["Total", reais(a.preco_centavos)],
          ]}
        />
        <p className="text-[13px] text-texto-suave">
          ⓘ Marcado {a.origem === "online" ? "pelo cliente (online)" : "pelo painel"}
          {criado ? ` em ${criado}` : ""}
        </p>

        {erro ? <Aviso>{erro}</Aviso> : null}

        {ativo ? (
          <>
            <Botao disabled={ocupado} onClick={() => void mudar("atendido")}>
              ✓ Chegou / Atendido
            </Botao>
            {confirmandoCancelar ? (
              <div className="flex flex-col gap-2 rounded-xl border border-erro/50 bg-erro/10 p-3.5">
                <b className="text-[15px]">Cancelar o horário de {primeiroNome(a.cliente_nome)}?</b>
                <div className="flex gap-2">
                  <Botao pequeno variante="secundario" className="!text-erro" disabled={ocupado} onClick={() => void mudar("cancelado")}>
                    Sim, cancelar
                  </Botao>
                  <Botao pequeno variante="secundario" onClick={() => setConfirmandoCancelar(false)}>
                    Voltar
                  </Botao>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {a.status === "marcado" ? (
                  <Botao pequeno variante="secundario" className="font-semibold !text-ok" disabled={ocupado} onClick={() => void mudar("confirmado")}>
                    Cliente confirmou
                  </Botao>
                ) : (
                  <Botao pequeno variante="secundario" className="font-semibold" disabled={ocupado} onClick={() => void mudar("marcado")}>
                    Voltar a agendado
                  </Botao>
                )}
                <Botao pequeno variante="secundario" className="font-semibold" onClick={() => aoRemarcar(a)}>
                  Remarcar
                </Botao>
                <Botao pequeno variante="secundario" className="font-semibold !text-erro" disabled={ocupado} onClick={() => void mudar("faltou")}>
                  Faltou
                </Botao>
                <Botao pequeno variante="secundario" className="font-semibold !text-erro" onClick={() => setConfirmandoCancelar(true)}>
                  Cancelar
                </Botao>
              </div>
            )}
          </>
        ) : (
          <Botao variante="secundario" disabled={ocupado} onClick={() => void mudar("marcado")}>
            Reabrir como agendado
          </Botao>
        )}

        {lembrete && conversa ? (
          <div className="flex gap-2">
            <BotaoLink pequeno variante="whatsapp" href={lembrete} target="_blank" rel="noopener noreferrer">
              Mandar lembrete
            </BotaoLink>
            <BotaoLink pequeno variante="secundario" href={conversa} target="_blank" rel="noopener noreferrer">
              Abrir conversa
            </BotaoLink>
          </div>
        ) : (
          <p className="text-center text-[13px] text-texto-suave">Cliente sem telefone: não dá para mandar WhatsApp.</p>
        )}
      </div>
    </Folha>
  );
}

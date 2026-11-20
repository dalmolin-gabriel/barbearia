import { Link, useLocation, useParams } from "react-router-dom";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Linhas } from "../componentes/Topo";
import { Logo } from "../componentes/Logo";
import { dataDe, diaExtenso, horaDe, reais } from "../util";

export type Reserva = {
  id: string;
  inicio: string;
  fim: string;
  servicos_txt: string;
  preco_centavos: number;
  barbeiro: string;
  barbearia: string;
  whatsapp: string;
  endereco?: string;
  /** Segredo do link para ver/cancelar o horário (vem do agendamento). */
  tokenCliente?: string;
};

const chaveSessao = (id: string) => `reserva:${id}`;

export function guardarReserva(r: Reserva) {
  try {
    sessionStorage.setItem(chaveSessao(r.id), JSON.stringify(r));
  } catch {
    /* sem armazenamento: o estado da navegação basta */
  }
}

function lerReserva(id: string): Reserva | null {
  try {
    const t = sessionStorage.getItem(chaveSessao(id));
    return t ? (JSON.parse(t) as Reserva) : null;
  } catch {
    return null;
  }
}

const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapar = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Arquivo .ics do horário (DTSTART/DTEND em UTC). */
export function gerarIcs(r: Reserva): string {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barbearia dos Padilhas//Agendamento//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${r.id}@padilhas`,
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(r.inicio)}`,
    `DTEND:${utc(r.fim)}`,
    `SUMMARY:${escapar(`${r.servicos_txt} · ${r.barbearia}`)}`,
    `DESCRIPTION:${escapar(`Barbeiro: ${r.barbeiro}`)}`,
    ...(r.endereco ? [`LOCATION:${escapar(r.endereco)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return linhas.join("\r\n") + "\r\n";
}

function baixarIcs(r: Reserva) {
  const blob = new Blob([gerarIcs(r)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "horario-padilhas.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Pronto() {
  const { id = "" } = useParams();
  const { state } = useLocation() as { state: { reserva?: Reserva } | null };
  const r = state?.reserva ?? lerReserva(id);

  if (!r) {
    return (
      <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 px-6 pt-10 text-center">
        <Logo tamanho={120} />
        <h1 className="bebas text-[34px]">Pronto, tá marcado!</h1>
        <p className="text-texto-suave">Seu horário foi registrado. Para rever os detalhes, chame a gente no WhatsApp.</p>
        <Link to="/" className="font-semibold text-ouro">
          Voltar ao início
        </Link>
      </div>
    );
  }

  const whats = r.whatsapp.replace(/\D/g, "");
  return (
    <div className="mx-auto flex max-w-[480px] flex-col items-center gap-3.5 px-6 pb-10 pt-[34px]">
      <Logo tamanho={120} />
      <div
        aria-hidden="true"
        className="mt-2.5 flex h-20 w-20 items-center justify-center rounded-full bg-ouro/15 text-[38px] font-bold text-ouro"
      >
        ✓
      </div>
      <h1 className="bebas text-[38px] leading-none">Pronto, tá marcado!</h1>
      <p className="text-center text-base text-texto-suave">
        Te esperamos {/^(sábado|domingo)/.test(diaExtenso(dataDe(r.inicio), true)) ? "no" : "na"}{" "}
        {diaExtenso(dataDe(r.inicio), true)} às {horaDe(r.inicio)}.
      </p>
      <Linhas
        className="cartao w-full p-4 text-sm"
        itens={[
          ["Serviço", r.servicos_txt],
          ["Barbeiro", r.barbeiro],
          ["Valor", reais(r.preco_centavos)],
        ]}
      />
      {r.tokenCliente ? (
        <Link
          to={`/meu-horario/${r.tokenCliente}`}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-ouro text-[17px] font-bold text-fundo"
        >
          Ver meu horário
        </Link>
      ) : null}
      <Botao variante={r.tokenCliente ? "secundario" : "principal"} onClick={() => baixarIcs(r)}>
        Adicionar à minha agenda
      </Botao>
      {whats ? (
        <BotaoLink variante="secundario" href={`https://wa.me/${whats}`} target="_blank" rel="noopener noreferrer">
          Falar no WhatsApp
        </BotaoLink>
      ) : null}
      {r.tokenCliente ? (
        <>
          <Link
            to={`/meu-horario/${r.tokenCliente}`}
            className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-borda text-[15px] font-semibold text-texto-suave"
          >
            Cancelar este horário
          </Link>
          <p className="text-center text-[13px] text-texto-suave">
            Dá para cancelar até 2 horas antes. Para remarcar, é só chamar a gente no WhatsApp.
          </p>
        </>
      ) : (
        <p className="text-center text-[13px] text-texto-suave">Precisa cancelar ou remarcar? Chama a gente no WhatsApp.</p>
      )}
    </div>
  );
}

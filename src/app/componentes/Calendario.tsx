import { diaSemanaDe } from "../../shared/tempo";
import { diaCurto, hojeLocal, rotuloMes, somarMeses } from "../util";

type Props = {
  /** Mês exibido, 'AAAA-MM'. */
  mes: string;
  /** Datas (AAAA-MM-DD) que podem ser escolhidas; sem isso, todas. */
  diasHabilitados?: string[];
  selecionado?: string | null;
  /** Datas com o número riscado (domingos, por exemplo). */
  riscados?: string[] | ((data: string) => boolean);
  aoEscolher: (data: string) => void;
  /** Troca de mês pelas setas; sem isso as setas ficam apagadas. */
  aoMudarMes?: (mes: string) => void;
  mesMinimo?: string;
  mesMaximo?: string;
};

export function Calendario({
  mes,
  diasHabilitados,
  selecionado,
  riscados,
  aoEscolher,
  aoMudarMes,
  mesMinimo,
  mesMaximo,
}: Props) {
  const [ano = 0, m = 1] = mes.split("-").map(Number);
  const total = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const vazios = (diaSemanaDe(`${mes}-01`) + 6) % 7; // semana começa na segunda
  const habilitados = diasHabilitados ? new Set(diasHabilitados) : null;
  const hoje = hojeLocal();
  const ehRiscado = (d: string) =>
    typeof riscados === "function" ? riscados(d) : riscados ? riscados.includes(d) : false;

  const anterior = somarMeses(mes, -1);
  const proximo = somarMeses(mes, 1);
  const podeVoltar = !!aoMudarMes && (!mesMinimo || anterior >= mesMinimo);
  const podeAvancar = !!aoMudarMes && (!mesMaximo || proximo <= mesMaximo);

  const celulas: React.ReactNode[] = [];
  for (let i = 0; i < vazios; i++) celulas.push(<span key={`v${i}`} />);
  for (let dia = 1; dia <= total; dia++) {
    const data = `${mes}-${String(dia).padStart(2, "0")}`;
    const ativo = !habilitados || habilitados.has(data);
    const sel = selecionado === data;
    let estilo = "text-apagado";
    if (ativo) estilo = "font-semibold text-texto";
    if (sel) estilo = "bg-ouro font-bold text-fundo";
    else if (data === hoje) estilo += " border border-ouro";
    celulas.push(
      <span key={data} className="flex h-10 items-center justify-center">
        <button
          type="button"
          disabled={!ativo}
          onClick={() => aoEscolher(data)}
          aria-label={data}
          aria-pressed={sel}
          className={`flex h-[38px] w-[38px] items-center justify-center rounded-full text-[15px] disabled:cursor-default ${estilo} ${ehRiscado(data) ? "line-through" : ""}`}
        >
          {dia}
        </button>
      </span>,
    );
  }

  const seta = (ativa: boolean, alvo: string, rotulo: string, sinal: string) => (
    <button
      type="button"
      disabled={!ativa}
      aria-label={rotulo}
      onClick={() => aoMudarMes?.(alvo)}
      className={`px-2.5 text-[22px] leading-none ${ativa ? "text-texto" : "text-apagado"}`}
    >
      {sinal}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        {seta(podeVoltar, anterior, "Mês anterior", "‹")}
        <span className="bebas text-[22px] tracking-[0.12em]">{rotuloMes(mes)}</span>
        {seta(podeAvancar, proximo, "Próximo mês", "›")}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <span key={d} className="flex h-[22px] items-center justify-center text-xs font-medium text-texto-suave">
            {diaCurto(d)}
          </span>
        ))}
        {celulas}
      </div>
    </div>
  );
}

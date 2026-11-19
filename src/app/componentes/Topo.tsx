import type { ReactNode } from "react";
import { Logo } from "./Logo";

/** Cabeçalho das telas do painel: logo, linha pequena e título em Bebas. */
export function Topo({
  sub,
  titulo,
  direita,
  subAbaixo = false,
}: {
  sub?: ReactNode;
  titulo: ReactNode;
  direita?: ReactNode;
  /** Linha pequena depois do título (Hoje) em vez de antes. */
  subAbaixo?: boolean;
}) {
  const linhaSub = sub ? <div className="text-[13px] text-texto-suave">{sub}</div> : null;
  return (
    <header className="flex items-center gap-3 px-5 pb-3 pt-[18px]">
      <Logo tamanho={48} />
      <div className="min-w-0 flex-1">
        {subAbaixo ? null : linhaSub}
        <h1 className="bebas whitespace-nowrap text-[30px] leading-none">{titulo}</h1>
        {subAbaixo ? <div className="mt-0.5 text-sm text-texto-suave">{sub}</div> : null}
      </div>
      {direita}
    </header>
  );
}

/** Rótulo de seção em caixa alta (PRÓXIMO CLIENTE, DEPOIS…). */
export function Secao({ children, ouro, className = "" }: { children: ReactNode; ouro?: boolean; className?: string }) {
  return (
    <b className={`text-[13px] tracking-[0.08em] ${ouro ? "text-ouro" : "text-texto-suave"} ${className}`}>{children}</b>
  );
}

/** Linhas chave/valor dos resumos (serviço, barbeiro, valor…). */
export function Linhas({ itens, className = "" }: { itens: [string, string][]; className?: string }) {
  return (
    <div className={`flex flex-col gap-[9px] ${className}`}>
      {itens.map(([k, v]) => {
        const destaque = k === "Valor" || k === "Total";
        return (
          <div key={k} className="flex justify-between gap-4">
            <span className="text-texto-suave">{k}</span>
            <b className={`text-right ${destaque ? "font-bold text-ouro" : "font-semibold"}`}>{v}</b>
          </div>
        );
      })}
    </div>
  );
}

/** Chave liga/desliga (aberto/fechado, ativo/inativo). */
export function Chave({
  ligada,
  aoMudar,
  rotulo,
  desabilitada,
}: {
  ligada: boolean;
  aoMudar?: (v: boolean) => void;
  rotulo: string;
  desabilitada?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      aria-label={rotulo}
      disabled={desabilitada || !aoMudar}
      onClick={() => aoMudar?.(!ligada)}
      className={`relative h-6 w-[42px] shrink-0 rounded-xl transition-colors ${ligada ? "bg-ouro" : "bg-superficie-alta"} disabled:opacity-60`}
    >
      <span
        className={`absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all ${ligada ? "left-[21px] bg-fundo" : "left-[3px] bg-texto-suave"}`}
      />
    </button>
  );
}

import type { ReactNode } from "react";

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

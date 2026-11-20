import type { ReactNode } from "react";

/** Rótulo de seção em caixa alta (PRÓXIMO CLIENTE, DEPOIS…). */
export function Secao({ children, ouro, className = "" }: { children: ReactNode; ouro?: boolean; className?: string }) {
  return <b className={`text-[13px] tracking-[0.08em] ${ouro ? "text-ouro" : "text-texto-suave"} ${className}`}>{children}</b>;
}

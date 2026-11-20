import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variante = "principal" | "secundario" | "whatsapp" | "contorno" | "perigo";

const VARIANTES: Record<Variante, string> = {
  principal: "bg-ouro text-fundo",
  secundario: "bg-superficie-alta text-texto",
  whatsapp: "bg-zap text-white",
  contorno: "border-2 border-ouro text-ouro",
  perigo: "border-2 border-erro text-erro",
};

type Comum = {
  variante?: Variante;
  pequeno?: boolean;
  compacto?: boolean;
  children: ReactNode;
};

function classes(v: Variante, pequeno: boolean | undefined, extra?: string, compacto?: boolean) {
  return [
    "flex items-center justify-center rounded-xl font-bold transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40",
    compacto ? "h-10 whitespace-nowrap px-4 text-sm" : `w-full ${pequeno ? "h-12 text-[15px]" : "h-14 text-[17px]"}`,
    VARIANTES[v],
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Botao({
  variante = "principal",
  pequeno,
  compacto,
  className,
  children,
  type = "button",
  ...resto
}: Comum & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={classes(variante, pequeno, className, compacto)} {...resto}>
      {children}
    </button>
  );
}

/** Mesmo visual do Botao, para links (WhatsApp, download). */
export function BotaoLink({
  variante = "principal",
  pequeno,
  compacto,
  className,
  children,
  ...resto
}: Comum & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={classes(variante, pequeno, className, compacto)} {...resto}>
      {children}
    </a>
  );
}

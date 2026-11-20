import type { ReactNode } from "react";

/**
 * Corpo de uma tela do painel: barra de título (Bebas à esquerda, ações à direita) e,
 * abaixo, o conteúdo com padding p-4 md:p-8 e largura máxima de 7xl.
 */
export function Pagina({ titulo, sub, acoes, children }: { titulo: ReactNode; sub?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="border-b border-borda bg-fundo/95 backdrop-blur lg:sticky lg:top-0 lg:z-20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 md:px-8 lg:py-5">
          <div className="min-w-0">
            <h1 className="bebas text-[30px] leading-none md:text-[36px]">{titulo}</h1>
            {sub ? <div className="mt-1 text-sm text-texto-suave">{sub}</div> : null}
          </div>
          {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>
    </>
  );
}

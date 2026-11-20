import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icone } from "../componentes/Icone";
import { Logo } from "../componentes/Logo";
import { useSessao } from "../sessao";
import { ITENS_MENU, itemAtual } from "./navegacao";

const FOCAVEIS = "a[href], button:not([disabled])";

/**
 * Menu lateral do painel. No desktop (lg) fica fixo à esquerda; abaixo disso vira uma gaveta
 * que desliza por cima da tela, fecha ao navegar, tocar fora ou apertar Esc e prende o foco.
 */
export function BarraLateral({
  aberta,
  aoFechar,
  aoSair,
  saindo,
}: {
  aberta: boolean;
  aoFechar: () => void;
  aoSair: () => void;
  saindo: boolean;
}) {
  const eu = useSessao();
  const { pathname } = useLocation();
  const atual = itemAtual(pathname);
  const raiz = useRef<HTMLElement>(null);
  const itens = ITENS_MENU.filter((i) => !i.soDono || eu.papel === "dono");

  useEffect(() => {
    if (!aberta) return;
    const antes = document.activeElement as HTMLElement | null;
    const travado = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    raiz.current?.querySelector<HTMLElement>(FOCAVEIS)?.focus();
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") return aoFechar();
      if (e.key !== "Tab" || !raiz.current) return;
      const lista = [...raiz.current.querySelectorAll<HTMLElement>(FOCAVEIS)];
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (!primeiro || !ultimo) return;
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    window.addEventListener("keydown", aoTecla);
    return () => {
      document.body.style.overflow = travado;
      window.removeEventListener("keydown", aoTecla);
      antes?.focus?.();
    };
  }, [aberta, aoFechar]);

  return (
    <>
      <div
        onClick={aoFechar}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/70 transition-opacity lg:hidden ${aberta ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        ref={raiz}
        aria-label="Barra lateral"
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-borda bg-superficie transition-transform duration-200 lg:z-30 lg:w-[260px] lg:translate-x-0 ${
          aberta ? "translate-x-0" : "-translate-x-full max-lg:invisible"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-borda px-5 py-5">
          <Logo tamanho={44} />
          <div className="bebas min-w-0 flex-1 text-[22px] leading-[1.05]">Barbearia dos Padilhas</div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-texto-suave hover:bg-superficie-alta lg:hidden"
          >
            <Icone nome="fechar" />
          </button>
        </div>

        <nav aria-label="Menu do painel" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {itens.map((i) => {
            const on = i.nome === atual.nome;
            return (
              <Link
                key={i.nome}
                to={i.caminho}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3.5 py-3 text-[15px] transition-colors ${
                  on ? "bg-ouro/15 font-bold text-ouro" : "font-medium text-texto-suave hover:bg-superficie-alta hover:text-texto"
                }`}
              >
                <Icone nome={i.icone} />
                {i.nome}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 border-t border-borda p-4">
          <div className="bebas flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-superficie-alta text-xl text-ouro">
            {eu.nome.trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{eu.nome}</div>
            <div className="text-xs text-texto-suave">{eu.papel === "dono" ? "Dono" : "Barbeiro"}</div>
          </div>
          <button
            type="button"
            onClick={aoSair}
            disabled={saindo}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-texto-suave hover:bg-superficie-alta hover:text-texto disabled:opacity-50"
          >
            <Icone nome="sair" tamanho={18} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

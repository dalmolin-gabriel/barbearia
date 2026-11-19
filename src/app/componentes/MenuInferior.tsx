import { Link, useLocation } from "react-router-dom";
import { useSessao } from "../sessao";

type Item = { nome: string; icone: string; caminho: string; soDono: boolean };

const ITENS: Item[] = [
  { nome: "Hoje", icone: "📅", caminho: "/painel", soDono: false },
  { nome: "Serviços", icone: "✂", caminho: "/painel/servicos", soDono: true },
  { nome: "Horários", icone: "🕐", caminho: "/painel/horarios", soDono: false },
  { nome: "Resumo", icone: "📊", caminho: "/painel/resumo", soDono: true },
  { nome: "Equipe", icone: "👥", caminho: "/painel/equipe", soDono: true },
];

/** Telas que não estão no menu mas pertencem a um item dele. */
const PERTENCE: Record<string, string> = {
  "/painel/lembretes": "Hoje",
  "/painel/clientes": "Equipe",
};

export function MenuInferior({ ativo }: { ativo?: string }) {
  const { papel } = useSessao();
  const { pathname } = useLocation();
  const atual =
    ativo ??
    PERTENCE[pathname] ??
    ITENS.find((i) => i.caminho === pathname.replace(/\/$/, ""))?.nome ??
    "Hoje";
  const itens = ITENS.filter((i) => !i.soDono || papel === "dono");

  return (
    <nav
      aria-label="Menu do painel"
      className="flex justify-around border-t border-borda bg-superficie px-1 pb-[max(24px,env(safe-area-inset-bottom))] pt-2.5"
    >
      {itens.map((i) => {
        const on = i.nome === atual;
        return (
          <Link
            key={i.nome}
            to={i.caminho}
            aria-current={on ? "page" : undefined}
            className={`flex min-w-14 flex-col items-center gap-[3px] text-[11px] ${on ? "font-bold text-ouro" : "font-medium text-texto-suave"}`}
          >
            <b className="text-xl font-normal leading-none">{i.icone}</b>
            {i.nome}
          </Link>
        );
      })}
    </nav>
  );
}

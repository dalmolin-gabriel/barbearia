import { createContext, useContext } from "react";

export type UsuarioSessao = { id: string; nome: string; papel: "dono" | "barbeiro" };

export const SessaoContexto = createContext<UsuarioSessao | null>(null);

/** Usuário logado do painel (só dentro de PainelLayout). */
export function useSessao(): UsuarioSessao {
  const u = useContext(SessaoContexto);
  if (!u) throw new Error("useSessao fora do painel");
  return u;
}

export const useEhDono = () => useSessao().papel === "dono";

import type { ReactNode } from "react";

const TIPOS = {
  erro: "border-erro/50 bg-erro/10 text-erro",
  info: "border-borda bg-superficie-alta text-texto-suave",
  ok: "border-ok/50 bg-ok/10 text-ok",
};

export function Aviso({ tipo = "erro", children }: { tipo?: keyof typeof TIPOS; children: ReactNode }) {
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={`rounded-[10px] border px-3.5 py-2.5 text-sm ${TIPOS[tipo]}`}>
      {children}
    </div>
  );
}

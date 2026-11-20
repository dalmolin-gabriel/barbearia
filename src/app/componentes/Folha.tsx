import { useEffect, type ReactNode } from "react";

/** Folha que sobe de baixo no celular e vira janela centralizada no desktop. Fecha tocando fora ou com Esc. */
export function Folha({
  aberta,
  aoFechar,
  children,
  rotulo,
}: {
  aberta: boolean;
  aoFechar: () => void;
  children: ReactNode;
  rotulo?: string;
}) {
  useEffect(() => {
    if (!aberta) return;
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", aoTecla);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", aoTecla);
    };
  }, [aberta, aoFechar]);

  if (!aberta) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center lg:p-6">
      <div className="anima-aparecer absolute inset-0 bg-black/70" onClick={aoFechar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        className="anima-subir relative max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl border-t border-borda bg-superficie px-5 pb-8 pt-3 lg:max-h-[90dvh] lg:max-w-[520px] lg:rounded-3xl lg:border lg:p-8 lg:shadow-2xl lg:[animation:aparecer_0.18s_ease-out]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-sm bg-borda lg:hidden" />
        {children}
      </div>
    </div>
  );
}

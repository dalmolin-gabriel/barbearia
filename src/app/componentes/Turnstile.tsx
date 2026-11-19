import { useEffect, useRef, useState } from "react";

type ApiTurnstile = {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

const URL_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let promessaScript: Promise<ApiTurnstile> | null = null;

function carregarScript(): Promise<ApiTurnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  promessaScript ??= new Promise<ApiTurnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = URL_SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("sem turnstile")));
    s.onerror = () => {
      promessaScript = null;
      s.remove();
      reject(new Error("falha ao carregar"));
    };
    document.head.appendChild(s);
  });
  return promessaScript;
}

/** Widget anti-robô da Cloudflare. `reiniciar` muda quando o token precisa ser refeito (o token vale uma vez). */
export function Turnstile({
  chave,
  aoToken,
  reiniciar,
}: {
  chave: string;
  aoToken: (token: string | null) => void;
  reiniciar: number;
}) {
  const alvo = useRef<HTMLDivElement>(null);
  const idWidget = useRef<string | null>(null);
  const aoTokenRef = useRef(aoToken);
  aoTokenRef.current = aoToken;
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    carregarScript()
      .then((t) => {
        if (!vivo || !alvo.current) return;
        idWidget.current = t.render(alvo.current, {
          sitekey: chave,
          theme: "dark",
          language: "pt-br",
          callback: (token: string) => aoTokenRef.current(token),
          "expired-callback": () => aoTokenRef.current(null),
          "error-callback": () => aoTokenRef.current(null),
        });
      })
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
      if (idWidget.current && window.turnstile) window.turnstile.remove(idWidget.current);
      idWidget.current = null;
    };
  }, [chave]);

  useEffect(() => {
    if (reiniciar > 0 && idWidget.current && window.turnstile) window.turnstile.reset(idWidget.current);
  }, [reiniciar]);

  return (
    <div>
      <div ref={alvo} className="flex min-h-[65px] justify-center" />
      {falhou ? (
        <p className="text-center text-sm text-erro">Não foi possível carregar a verificação. Recarregue a página.</p>
      ) : null}
    </div>
  );
}

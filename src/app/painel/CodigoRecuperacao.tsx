import { useState } from "react";
import { Botao } from "../componentes/Botao";
import { Aviso } from "../componentes/Aviso";

/** Mostra o código de recuperação (uma única vez) com "Copiar" e o botão para seguir adiante. */
export function CodigoRecuperacao({ codigo, rotuloBotao, aoContinuar }: { codigo: string; rotuloBotao: string; aoContinuar: () => void }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="bebas text-[30px] leading-none">Guarde este código de recuperação</h2>
      <p className="text-[15px] text-texto-suave">
        Se um dia você esquecer a senha, é este código que deixa você criar outra. Ele aparece só desta vez e não dá para ver de novo.
      </p>
      <div
        data-testid="codigo-recuperacao"
        className="select-all rounded-xl border border-ouro/60 bg-superficie-alta px-3 py-5 text-center font-mono text-[26px] font-bold tracking-widest text-ouro"
      >
        {codigo}
      </div>
      <Botao variante="contorno" pequeno onClick={() => void copiar()}>
        {copiado ? "Copiado!" : "Copiar"}
      </Botao>
      <Aviso tipo="info">Tire um print da tela ou anote em um papel e guarde num lugar seguro. Quem tiver este código consegue trocar a sua senha.</Aviso>
      <Botao onClick={aoContinuar}>{rotuloBotao}</Botao>
    </div>
  );
}

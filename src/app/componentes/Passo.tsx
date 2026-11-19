/** Linha "rótulo  −  [valor]  +" com botões de passo e digitação direta. */
export function Passo({
  rotulo,
  valor,
  aoMudar,
  passo,
  minimo,
  maximo = 100000,
  prefixo,
  sufixo,
}: {
  rotulo: string;
  valor: number;
  aoMudar: (v: number) => void;
  passo: number;
  minimo: number;
  maximo?: number;
  prefixo?: string;
  sufixo?: string;
}) {
  const limitar = (v: number) => Math.min(maximo, Math.max(minimo, v));
  const botao = "flex h-[38px] w-10 items-center justify-center rounded-xl bg-superficie-alta text-lg font-bold text-ouro disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm text-texto-suave">{rotulo}</span>
      <button type="button" aria-label={`Diminuir ${rotulo}`} className={botao} disabled={valor <= minimo} onClick={() => aoMudar(limitar(valor - passo))}>
        −
      </button>
      <label className="flex h-[38px] items-center justify-center gap-1 rounded-xl bg-fundo px-3 text-base font-bold">
        {prefixo ? <span>{prefixo}</span> : null}
        <input
          aria-label={rotulo}
          inputMode="numeric"
          className="w-12 bg-transparent text-center outline-none"
          value={String(valor)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""));
            aoMudar(Math.min(maximo, n));
          }}
          onBlur={() => aoMudar(limitar(valor))}
        />
        {sufixo ? <span>{sufixo}</span> : null}
      </label>
      <button type="button" aria-label={`Aumentar ${rotulo}`} className={botao} disabled={valor >= maximo} onClick={() => aoMudar(limitar(valor + passo))}>
        +
      </button>
    </div>
  );
}

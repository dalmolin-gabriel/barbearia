import { iniciais } from "../util";

// Tons suaves que combinam com o fundo escuro e o dourado (fundo translúcido + texto claro).
const TONS = [
  "bg-[#7a5c3a]/40 text-[#e6c9a0]",
  "bg-[#3e6b5a]/40 text-[#a9dcc6]",
  "bg-[#5a5a86]/40 text-[#c3c3ee]",
  "bg-[#86506a]/40 text-[#e9bad2]",
  "bg-[#3f6683]/40 text-[#aed3ec]",
  "bg-[#7a6a2e]/40 text-[#e3d58e]",
];

function indice(nome: string): number {
  let h = 0;
  for (const c of nome.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % TONS.length;
}

/** Círculo com as iniciais; a cor depende só do nome. */
export function Avatar({ nome, tamanho = 40 }: { nome: string; tamanho?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: Math.round(tamanho * 0.4),
      }}
      className={`bebas flex shrink-0 items-center justify-center rounded-full tracking-wide ${TONS[indice(nome)]}`}
    >
      {iniciais(nome) || "?"}
    </span>
  );
}

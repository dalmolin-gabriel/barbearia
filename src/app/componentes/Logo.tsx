export function Logo({ tamanho = 48, className = "" }: { tamanho?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Barbearia dos Padilhas"
      width={tamanho}
      height={tamanho}
      style={{ borderRadius: Math.max(6, Math.round(tamanho / 6)) }}
      className={`block shrink-0 ${className}`}
    />
  );
}

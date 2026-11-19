export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-texto-suave" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-borda border-t-ouro" />
      {texto}
    </div>
  );
}

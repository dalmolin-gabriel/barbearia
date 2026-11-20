import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Folha } from "../componentes/Folha";
import { Avatar } from "../componentes/Avatar";
import { Pagina } from "../componentes/Pagina";
import { useCarregar } from "../hooks";
import { formatarTelefone } from "../../shared/telefone";
import { dataDe } from "../util";

type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  ultimo_atendimento: string | null;
};

export default function Clientes() {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setTermo(busca.trim()), 300);
    return () => window.clearTimeout(t);
  }, [busca]);

  const lista = useCarregar(() => api<{ clientes: Cliente[] }>(`/api/clientes?busca=${encodeURIComponent(termo)}`), [termo]);
  const [apagando, setApagando] = useState<Cliente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function apagar() {
    if (!apagando) return;
    setOcupado(true);
    setErro(null);
    try {
      await api(`/api/clientes/${apagando.id}`, { metodo: "DELETE" });
      setApagando(null);
      await lista.recarregar();
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setOcupado(false);
    }
  }

  const clientes = lista.dados?.clientes ?? [];
  const colunas = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_130px]";
  const ultimo = (c: Cliente) =>
    c.ultimo_atendimento
      ? (c.ultimo_atendimento.length === 10 ? c.ultimo_atendimento : dataDe(c.ultimo_atendimento)).split("-").reverse().join("/")
      : "—";

  return (
    <Pagina titulo="Clientes" sub="Seus clientes e a privacidade deles">
      <div className="flex flex-col gap-4">
        <Link to="/painel/equipe" className="self-start text-sm font-semibold text-ouro lg:hidden">
          ‹ Equipe
        </Link>
        <input
          className="campo max-w-xl"
          type="search"
          aria-label="Buscar cliente"
          placeholder="Buscar por nome ou celular"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {lista.erro ? <Aviso>{lista.erro}</Aviso> : null}
        {erro && !apagando ? <Aviso>{erro}</Aviso> : null}
        {lista.carregando && !lista.dados ? <Carregando /> : null}
        {lista.dados && clientes.length === 0 ? (
          <div className="cartao p-6 text-center text-[15px] text-texto-suave">
            {termo ? "Nenhum cliente encontrado." : "Digite um nome ou celular para buscar."}
          </div>
        ) : null}
        {clientes.length ? (
          <div className="cartao overflow-hidden">
            <div
              className={`hidden gap-4 border-b border-borda px-5 py-3 text-xs font-semibold uppercase tracking-wider text-texto-suave md:grid ${colunas}`}
            >
              <span>Cliente</span>
              <span>Celular</span>
              <span>Último atendimento</span>
              <span />
            </div>
            {clientes.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 border-b border-borda px-5 py-3.5 last:border-b-0 md:grid md:gap-4 ${colunas}`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar nome={c.nome} tamanho={40} />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold">{c.nome}</div>
                    <div className="text-[13px] text-texto-suave md:hidden">
                      {c.telefone ? formatarTelefone(c.telefone) : "Sem telefone"}
                      {c.ultimo_atendimento ? ` · último em ${ultimo(c)}` : ""}
                    </div>
                  </div>
                </div>
                <div className="hidden text-sm md:block">{c.telefone ? formatarTelefone(c.telefone) : "Sem telefone"}</div>
                <div className="hidden text-sm text-texto-suave md:block">{ultimo(c)}</div>
                <div className="md:text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setErro(null);
                      setApagando(c);
                    }}
                    className="text-sm font-semibold text-erro"
                    aria-label={`Apagar dados de ${c.nome}`}
                  >
                    Apagar dados
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {apagando ? (
        <Folha aberta aoFechar={() => setApagando(null)} rotulo="Apagar dados do cliente">
          <div className="flex flex-col gap-4">
            <h2 className="bebas text-[28px] leading-none">Apagar dados</h2>
            <p className="text-[15px]">
              Os dados de {apagando.nome} serão apagados. O histórico de atendimentos continua, sem nome e telefone.
            </p>
            {erro ? <Aviso>{erro}</Aviso> : null}
            <Botao variante="secundario" className="!text-erro" disabled={ocupado} onClick={() => void apagar()}>
              {ocupado ? "Apagando…" : "Apagar dados"}
            </Botao>
            <Botao variante="secundario" onClick={() => setApagando(null)}>
              Cancelar
            </Botao>
          </div>
        </Folha>
      ) : null}
    </Pagina>
  );
}

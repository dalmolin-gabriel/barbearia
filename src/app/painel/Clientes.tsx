import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Folha } from "../componentes/Folha";
import { Topo } from "../componentes/Topo";
import { useCarregar } from "../hooks";
import { formatarTelefone } from "../../shared/telefone";
import { dataDe } from "../util";

type Cliente = { id: string; nome: string; telefone: string | null; ultimo_atendimento: string | null };

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

  return (
    <div className="flex flex-col">
      <Topo sub="Seus clientes e a privacidade deles" titulo="Clientes" />
      <div className="flex flex-col gap-2.5 px-5 pb-6">
        <Link to="/painel/equipe" className="self-start text-sm font-semibold text-ouro">
          ‹ Equipe
        </Link>
        <input
          className="campo"
          type="search"
          aria-label="Buscar cliente"
          placeholder="Buscar por nome ou celular"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {lista.erro ? <Aviso>{lista.erro}</Aviso> : null}
        {erro && !apagando ? <Aviso>{erro}</Aviso> : null}
        {lista.carregando && !lista.dados ? <Carregando /> : null}
        {lista.dados && lista.dados.clientes.length === 0 ? (
          <div className="cartao p-5 text-center text-[15px] text-texto-suave">Nenhum cliente encontrado.</div>
        ) : null}
        {(lista.dados?.clientes ?? []).map((c) => (
          <div key={c.id} className="cartao flex items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{c.nome}</div>
              <div className="text-[13px] text-texto-suave">
                {c.telefone ? formatarTelefone(c.telefone) : "Sem telefone"}
                {c.ultimo_atendimento ? ` · último em ${(c.ultimo_atendimento.length === 10 ? c.ultimo_atendimento : dataDe(c.ultimo_atendimento)).split("-").reverse().join("/")}` : ""}
              </div>
            </div>
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
        ))}
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
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Folha } from "../componentes/Folha";
import { Topo } from "../componentes/Topo";
import { useCarregar } from "../hooks";
import { useSessao } from "../sessao";
import { iniciais } from "../util";
import Notificacoes from "./Notificacoes";

type Membro = { id: string; nome: string; usuario: string; papel: "dono" | "barbeiro"; ativo: number | boolean };

export default function Equipe() {
  const eu = useSessao();
  const lista = useCarregar(() => api<{ equipe: Membro[] }>("/api/equipe"), []);
  const [editando, setEditando] = useState<Membro | null>(null);
  const [cadastrando, setCadastrando] = useState(false);

  const salvou = () => {
    setEditando(null);
    setCadastrando(false);
    void lista.recarregar();
  };

  return (
    <div className="flex flex-col">
      <Topo sub="Só o dono vê esta tela" titulo="Equipe" />
      <div className="flex flex-col gap-2.5 px-5 pb-6">
        {lista.erro ? <Aviso>{lista.erro}</Aviso> : null}
        {lista.carregando && !lista.dados ? <Carregando /> : null}
        {(lista.dados?.equipe ?? []).map((m) => (
          <div key={m.id} className={`cartao flex items-center gap-3 p-3.5 ${m.ativo ? "" : "opacity-60"}`}>
            <div className="bebas flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-superficie-alta text-[22px] text-ouro">
              {iniciais(m.nome)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{m.nome}</div>
              <span className={`pilula ${m.papel === "dono" ? "text-ouro" : "text-texto-suave"}`}>
                {m.papel === "dono" ? "Dono" : "Barbeiro"}
              </span>
              {m.ativo ? null : <span className="pilula ml-1.5 text-texto-suave">Inativo</span>}
            </div>
            <button type="button" onClick={() => setEditando(m)} className="text-sm font-semibold text-ouro" aria-label={`Editar ${m.nome}`}>
              Editar
            </button>
          </div>
        ))}
        <Botao variante="secundario" onClick={() => setCadastrando(true)}>
          + Cadastrar barbeiro
        </Botao>
        <Notificacoes />
        <Link to="/painel/clientes" className="rounded-xl bg-superficie-alta py-3 text-center text-[15px] font-semibold text-ouro">
          Clientes e privacidade ›
        </Link>
      </div>

      {editando ? <EditarMembro membro={editando} ehEu={editando.id === eu.id} aoFechar={() => setEditando(null)} aoSalvo={salvou} /> : null}
      {cadastrando ? <NovoMembro aoFechar={() => setCadastrando(false)} aoSalvo={salvou} /> : null}
    </div>
  );
}

function NovoMembro({ aoFechar, aoSalvo }: { aoFechar: () => void; aoSalvo: () => void }) {
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    if (!nome.trim() || !usuario.trim()) return setErro("Informe o nome e o usuário.");
    if (senha.length < 8) return setErro("A senha provisória precisa ter pelo menos 8 caracteres.");
    setEnviando(true);
    setErro(null);
    try {
      await api("/api/equipe", { corpo: { nome: nome.trim(), usuario: usuario.trim(), senha } });
      aoSalvo();
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha aberta aoFechar={aoFechar} rotulo="Cadastrar barbeiro">
      <div className="flex flex-col gap-4">
        <h2 className="bebas text-[28px] leading-none">Cadastrar barbeiro</h2>
        <div>
          <label className="rotulo block" htmlFor="n-nome">
            Nome
          </label>
          <input id="n-nome" className="campo" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label className="rotulo block" htmlFor="n-usuario">
            Usuário (para entrar)
          </label>
          <input
            id="n-usuario"
            className="campo"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={40}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </div>
        <div>
          <label className="rotulo block" htmlFor="n-senha">
            Senha provisória (mínimo 8)
          </label>
          <input id="n-senha" className="campo" type="text" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        {erro ? <Aviso>{erro}</Aviso> : null}
        <Botao disabled={enviando} onClick={() => void salvar()}>
          {enviando ? "Salvando…" : "Cadastrar"}
        </Botao>
      </div>
    </Folha>
  );
}

function EditarMembro({
  membro,
  ehEu,
  aoFechar,
  aoSalvo,
}: {
  membro: Membro;
  ehEu: boolean;
  aoFechar: () => void;
  aoSalvo: () => void;
}) {
  const [nome, setNome] = useState(membro.nome);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ativo = !!membro.ativo;

  async function enviar(corpo: Record<string, unknown>) {
    setEnviando(true);
    setErro(null);
    try {
      await api(`/api/equipe/${membro.id}`, { metodo: "PUT", corpo });
      aoSalvo();
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  function salvar() {
    if (!nome.trim()) return setErro("Informe o nome.");
    if (senha && senha.length < 8) return setErro("A nova senha precisa ter pelo menos 8 caracteres.");
    void enviar({ nome: nome.trim(), ...(senha ? { senha } : {}) });
  }

  return (
    <Folha aberta aoFechar={aoFechar} rotulo="Editar membro da equipe">
      <div className="flex flex-col gap-4">
        <h2 className="bebas text-[28px] leading-none">Editar {membro.nome}</h2>
        <p className="text-sm text-texto-suave">Usuário: {membro.usuario}</p>
        <div>
          <label className="rotulo block" htmlFor="e-nome">
            Nome
          </label>
          <input id="e-nome" className="campo" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label className="rotulo block" htmlFor="e-senha">
            Trocar senha (deixe em branco para manter)
          </label>
          <input id="e-senha" className="campo" type="text" autoComplete="off" placeholder="Nova senha, mínimo 8" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        {erro ? <Aviso>{erro}</Aviso> : null}
        <Botao disabled={enviando} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar"}
        </Botao>
        {ehEu ? null : (
          <Botao variante="secundario" className={ativo ? "!text-erro" : "!text-ok"} disabled={enviando} onClick={() => void enviar({ ativo: !ativo })}>
            {ativo ? "Desativar" : "Reativar"}
          </Botao>
        )}
      </div>
    </Folha>
  );
}

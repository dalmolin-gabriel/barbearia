import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Folha } from "../componentes/Folha";
import { Avatar } from "../componentes/Avatar";
import { Pagina } from "../componentes/Pagina";
import { useCarregar } from "../hooks";
import { useSessao } from "../sessao";
import Notificacoes from "./Notificacoes";

type Membro = {
  id: string;
  nome: string;
  usuario: string;
  papel: "dono" | "barbeiro";
  ativo: number | boolean;
};

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

  const equipe = lista.dados?.equipe ?? [];
  const colunas = "md:grid-cols-[minmax(200px,1.4fr)_minmax(0,1.6fr)_110px_90px_70px]";

  return (
    <Pagina
      titulo="Equipe"
      sub="Só o dono vê esta tela"
      acoes={
        <Botao compacto onClick={() => setCadastrando(true)}>
          + Cadastrar barbeiro
        </Botao>
      }
    >
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-3">
          {lista.erro ? <Aviso>{lista.erro}</Aviso> : null}
          {lista.carregando && !lista.dados ? <Carregando /> : null}
          {equipe.length ? (
            <div className="cartao overflow-hidden">
              <div
                className={`hidden gap-4 border-b border-borda px-5 py-3 text-xs font-semibold uppercase tracking-wider text-texto-suave md:grid ${colunas}`}
              >
                <span>Nome</span>
                <span>E-mail</span>
                <span>Papel</span>
                <span>Situação</span>
                <span />
              </div>
              {equipe.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 border-b border-borda px-5 py-3.5 last:border-b-0 md:grid md:gap-4 ${colunas} ${m.ativo ? "" : "opacity-60"}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar nome={m.nome} tamanho={44} />
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{m.nome}</div>
                      <div className="truncate text-xs text-texto-suave md:hidden">{m.usuario}</div>
                      <span className="md:hidden">
                        <span className={`pilula ${m.papel === "dono" ? "text-ouro" : "text-texto-suave"}`}>
                          {m.papel === "dono" ? "Dono" : "Barbeiro"}
                        </span>
                        {m.ativo ? null : <span className="pilula ml-1.5 text-texto-suave">Inativo</span>}
                      </span>
                    </div>
                  </div>
                  <div className="hidden truncate text-sm text-texto-suave md:block">{m.usuario}</div>
                  <div className="hidden md:block">
                    <span className={`pilula ${m.papel === "dono" ? "text-ouro" : "text-texto-suave"}`}>
                      {m.papel === "dono" ? "Dono" : "Barbeiro"}
                    </span>
                  </div>
                  <div className="hidden md:block">
                    <span className={`pilula ${m.ativo ? "text-ok" : "text-texto-suave"}`}>{m.ativo ? "Ativo" : "Inativo"}</span>
                  </div>
                  <div className="md:text-right">
                    <button
                      type="button"
                      onClick={() => setEditando(m)}
                      className="text-sm font-semibold text-ouro"
                      aria-label={`Editar ${m.nome}`}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <Link
            to="/painel/clientes"
            className="rounded-xl bg-superficie-alta py-3 text-center text-[15px] font-semibold text-ouro lg:hidden"
          >
            Clientes e privacidade ›
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          <Notificacoes />
          {eu.papel === "dono" ? <ZerarSistema /> : null}
        </div>
      </div>

      {editando ? (
        <EditarMembro membro={editando} ehEu={editando.id === eu.id} aoFechar={() => setEditando(null)} aoSalvo={salvou} />
      ) : null}
      {cadastrando ? <NovoMembro aoFechar={() => setCadastrando(false)} aoSalvo={salvou} /> : null}
    </Pagina>
  );
}

function NovoMembro({ aoFechar, aoSalvo }: { aoFechar: () => void; aoSalvo: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    if (!nome.trim() || !email.trim()) return setErro("Informe o nome e o e-mail.");
    if (senha.length < 8) return setErro("A senha provisória precisa ter pelo menos 8 caracteres.");
    setEnviando(true);
    setErro(null);
    try {
      await api("/api/equipe", {
        corpo: { nome: nome.trim(), email: email.trim(), senha },
      });
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
          <label className="rotulo block" htmlFor="n-email">
            E-mail (para entrar)
          </label>
          <input
            id="n-email"
            className="campo"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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

function EditarMembro({ membro, ehEu, aoFechar, aoSalvo }: { membro: Membro; ehEu: boolean; aoFechar: () => void; aoSalvo: () => void }) {
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
        <p className="text-sm text-texto-suave">E-mail: {membro.usuario}</p>
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
          <input
            id="e-senha"
            className="campo"
            type="text"
            autoComplete="off"
            placeholder="Nova senha, mínimo 8"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        {erro ? <Aviso>{erro}</Aviso> : null}
        <Botao disabled={enviando} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar"}
        </Botao>
        {ehEu ? null : (
          <Botao
            variante="secundario"
            className={ativo ? "!text-erro" : "!text-ok"}
            disabled={enviando}
            onClick={() => void enviar({ ativo: !ativo })}
          >
            {ativo ? "Desativar" : "Reativar"}
          </Botao>
        )}
      </div>
    </Folha>
  );
}

/** Zona de perigo (só o dono): apaga contas e dados de clientes para entregar o sistema limpo. */
function ZerarSistema() {
  const navegar = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function zerar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api("/api/sistema/zerar", {
        corpo: { senha, confirmacao: confirmacao.trim() },
      });
      navegar("/painel/cadastro", { replace: true });
    } catch (e) {
      setErro(mensagemDe(e));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={zerar} className="cartao flex flex-col gap-3 border border-erro/60 p-3.5" aria-labelledby="zerar-titulo">
      <h2 id="zerar-titulo" className="text-base font-semibold text-erro">
        Zerar sistema e entregar para o dono
      </h2>
      <p className="text-sm text-texto-suave">
        Apaga todas as contas (inclusive a sua), clientes, agendamentos, bloqueios e as inscrições de notificação. Mantém os serviços, os
        preços e as configurações. Depois disso, a tela de entrada volta a mostrar &quot;Cadastre-se&quot; para o dono criar a conta dele.
        Não dá para desfazer.
      </p>
      <div>
        <label className="rotulo block" htmlFor="z-senha">
          Sua senha atual
        </label>
        <input
          id="z-senha"
          className="campo"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </div>
      <div>
        <label className="rotulo block" htmlFor="z-confirmacao">
          Digite ZERAR para confirmar
        </label>
        <input
          id="z-confirmacao"
          className="campo"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
      </div>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Botao type="submit" variante="secundario" className="!text-erro" disabled={enviando || !senha || confirmacao.trim() !== "ZERAR"}>
        {enviando ? "Zerando…" : "Zerar sistema"}
      </Botao>
    </form>
  );
}

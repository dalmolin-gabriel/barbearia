import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Logo } from "../componentes/Logo";

/** Primeiro acesso: cria a conta do dono, uma única vez, com o código de instalação. */
export default function PrimeiroAcesso() {
  const navegar = useNavigate();
  const [disponivel, setDisponivel] = useState<boolean | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api<{ disponivel: boolean }>("/api/primeiro-acesso")
      .then((r) => vivo && setDisponivel(r.disponivel))
      .catch((e) => vivo && setFalha(mensagemDe(e)));
    return () => {
      vivo = false;
    };
  }, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    setEnviando(true);
    setErro(null);
    try {
      await api("/api/primeiro-acesso", {
        corpo: { codigo: codigo.trim(), nome: nome.trim(), usuario: usuario.trim(), senha },
      });
      navegar("/painel", { replace: true });
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  const cabecalho = (
    <div className="flex flex-col items-center gap-2.5">
      <Logo tamanho={150} className="shadow-[0_0_40px_rgba(208,184,72,0.25)]" />
      <h1 className="bebas mt-2 text-[34px] leading-none">Primeiro acesso</h1>
    </div>
  );

  if (falha) {
    return (
      <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-6 pb-10 pt-10">
        {cabecalho}
        <Aviso>{falha}</Aviso>
      </div>
    );
  }
  if (disponivel === null) return <Carregando />;

  if (!disponivel) {
    return (
      <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-6 pb-10 pt-10">
        {cabecalho}
        <Aviso tipo="info">O sistema já foi configurado.</Aviso>
        <Link to="/painel/entrar" className="rounded-xl bg-superficie-alta py-3 text-center text-[15px] font-semibold text-ouro">
          Ir para a entrada do painel ›
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={criar} className="mx-auto flex max-w-[480px] flex-col gap-4 px-6 pb-10 pt-10">
      {cabecalho}
      <p className="text-center text-[15px] text-texto-suave">
        Crie a conta do dono. Você precisa do código de instalação, o mesmo que foi cadastrado no Cloudflare.
      </p>
      <div>
        <label htmlFor="codigo" className="rotulo block">
          Código de instalação
        </label>
        <input
          id="codigo"
          className="campo"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="nome" className="rotulo block">
          Seu nome
        </label>
        <input id="nome" className="campo" autoComplete="name" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div>
        <label htmlFor="usuario" className="rotulo block">
          Usuário
        </label>
        <input
          id="usuario"
          className="campo"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={30}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />
        <p className="mt-1 text-xs text-texto-suave">De 3 a 30 letras, números, ponto, hífen ou sublinhado.</p>
      </div>
      <div>
        <label htmlFor="senha" className="rotulo block">
          Senha (mínimo 8 caracteres)
        </label>
        <div className="flex items-center gap-2">
          <input
            id="senha"
            className="campo"
            type={mostrar ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <button
            type="button"
            aria-pressed={mostrar}
            onClick={() => setMostrar((m) => !m)}
            className="shrink-0 px-2 text-sm font-semibold text-ouro"
          >
            {mostrar ? "esconder" : "mostrar"}
          </button>
        </div>
      </div>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Botao type="submit" disabled={enviando || !codigo.trim() || !nome.trim() || !usuario.trim() || !senha}>
        {enviando ? "Criando…" : "Criar conta"}
      </Botao>
    </form>
  );
}

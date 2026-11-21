import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Carregando } from "../componentes/Carregando";
import { Logo } from "../componentes/Logo";
import { CodigoRecuperacao } from "./CodigoRecuperacao";

/** Cadastro: cria a primeira conta (o dono). Só fica aberto enquanto não existe nenhuma conta. */
export default function Cadastro() {
  const navegar = useNavigate();
  const [disponivel, setDisponivel] = useState<boolean | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api<{ disponivel: boolean }>("/api/cadastro")
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
      const r = await api<{ codigoRecuperacao: string }>("/api/cadastro", { corpo: { email: email.trim(), senha } });
      setCodigo(r.codigoRecuperacao);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  const cabecalho = (
    <div className="flex flex-col items-center gap-2.5">
      <Logo tamanho={150} className="shadow-[0_0_40px_rgba(208,184,72,0.25)]" />
      <h1 className="bebas mt-2 text-[34px] leading-none">Criar conta</h1>
    </div>
  );

  // Conta criada: mostra o código de recuperação uma vez, antes de entrar no painel.
  if (codigo) {
    return (
      <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-6 pb-10 pt-10">
        <CodigoRecuperacao codigo={codigo} rotuloBotao="Já guardei" aoContinuar={() => navegar("/painel", { replace: true })} />
      </div>
    );
  }

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
        <Aviso tipo="info">Cadastro fechado. Peça ao dono para criar sua conta.</Aviso>
        <Link to="/painel/entrar" className="rounded-xl bg-superficie-alta py-3 text-center text-[15px] font-semibold text-ouro">
          Ir para a entrada do painel ›
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={criar} className="mx-auto flex max-w-[480px] flex-col gap-4 px-6 pb-10 pt-10">
      {cabecalho}
      <div>
        <label htmlFor="email" className="rotulo block">
          E-mail
        </label>
        <input
          id="email"
          className="campo"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
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
      <Botao type="submit" disabled={enviando || !email.trim() || !senha}>
        {enviando ? "Criando…" : "Criar conta"}
      </Botao>
      <p className="text-center text-xs text-texto-suave">
        Você pode trocar o nome que aparece para os clientes depois, em Equipe.
      </p>
      <Link to="/painel/entrar" className="text-center text-[15px] font-semibold text-ouro">
        Já tem conta? Entrar
      </Link>
    </form>
  );
}

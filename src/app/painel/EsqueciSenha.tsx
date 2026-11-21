import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Logo } from "../componentes/Logo";

/** Redefinição de senha do dono com o código de recuperação. Barbeiro pede ao dono, em Equipe. */
export default function EsqueciSenha() {
  const navegar = useNavigate();
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return setErro("A nova senha precisa ter pelo menos 8 caracteres.");
    if (senha !== confirmar) return setErro("A confirmação não é igual à nova senha.");
    setEnviando(true);
    setErro(null);
    try {
      await api("/api/auth/recuperar", { corpo: { email: email.trim(), codigo: codigo.trim(), novaSenha: senha } });
      navegar("/painel/entrar", {
        replace: true,
        state: { aviso: "Senha alterada! Entre com a nova senha. Gere um novo código de recuperação em Equipe." },
      });
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mx-auto flex max-w-[480px] flex-col gap-4 px-6 pb-10 pt-10">
      <div className="flex flex-col items-center gap-2.5">
        <Logo tamanho={110} className="shadow-[0_0_40px_rgba(208,184,72,0.25)]" />
        <h1 className="bebas mt-2 text-[34px] leading-none">Esqueci minha senha</h1>
      </div>
      <Aviso tipo="info">É barbeiro? Peça ao dono para criar uma nova senha para você em Equipe.</Aviso>
      <p className="text-[15px] text-texto-suave">Dono: use o código de recuperação que você guardou ao criar a conta.</p>
      <div>
        <label htmlFor="email" className="rotulo block">
          E-mail
        </label>
        <input
          id="email"
          className="campo"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="codigo" className="rotulo block">
          Código de recuperação
        </label>
        <input
          id="codigo"
          className="campo font-mono uppercase tracking-widest"
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={40}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="nova" className="rotulo block">
          Nova senha (mínimo 8 caracteres)
        </label>
        <div className="flex items-center gap-2">
          <input
            id="nova"
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
      <div>
        <label htmlFor="confirmar" className="rotulo block">
          Confirmar nova senha
        </label>
        <input
          id="confirmar"
          className="campo"
          type={mostrar ? "text" : "password"}
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
        />
      </div>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Botao type="submit" disabled={enviando || !email.trim() || !codigo.trim() || !senha || !confirmar}>
        {enviando ? "Alterando…" : "Alterar senha"}
      </Botao>
      <Link to="/painel/entrar" className="text-center text-[15px] font-semibold text-ouro">
        Voltar para a entrada
      </Link>
    </form>
  );
}

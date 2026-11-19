import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Logo } from "../componentes/Logo";

export default function Login() {
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api("/api/auth/entrar", { corpo: { usuario: usuario.trim(), senha } });
      navegar("/painel", { replace: true });
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="mx-auto flex max-w-[480px] flex-col gap-4 px-6 pb-10 pt-10">
      <div className="flex flex-col items-center gap-2.5">
        <Logo tamanho={150} className="shadow-[0_0_40px_rgba(208,184,72,0.25)]" />
        <h1 className="bebas mt-2 text-[34px] leading-none">Painel da barbearia</h1>
        <p className="text-[15px] text-texto-suave">Entre com o seu usuário e a sua senha.</p>
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
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="senha" className="rotulo block">
          Senha
        </label>
        <input
          id="senha"
          className="campo"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </div>
      {erro ? <Aviso>{erro}</Aviso> : null}
      <Botao type="submit" disabled={enviando || !usuario.trim() || !senha}>
        {enviando ? "Entrando…" : "Entrar"}
      </Botao>
    </form>
  );
}

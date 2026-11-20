import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, ErroApi } from "../api";
import { Carregando } from "../componentes/Carregando";
import { Icone } from "../componentes/Icone";
import { Logo } from "../componentes/Logo";
import { SessaoContexto, type UsuarioSessao } from "../sessao";
import { BarraLateral } from "./BarraLateral";
import { itemAtual, semBarra } from "./navegacao";

/** Casca do painel: confere a sessão e mostra o menu lateral (gaveta no celular). */
export default function PainelLayout() {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [semSessao, setSemSessao] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const fecharMenu = useCallback(() => setMenuAberto(false), []);

  useEffect(() => {
    let vivo = true;
    api<{ usuario: UsuarioSessao }>("/api/auth/eu")
      .then((r) => vivo && setUsuario(r.usuario))
      .catch((e) => {
        if (!vivo) return;
        if (e instanceof ErroApi && e.status === 401) setSemSessao(true);
        else setFalha(e instanceof ErroApi ? e.mensagem : "Não foi possível abrir o painel.");
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Navegou: a gaveta fecha sozinha.
  useEffect(() => setMenuAberto(false), [pathname]);

  async function sair() {
    setSaindo(true);
    try {
      await api("/api/auth/sair", { corpo: {} });
    } catch {
      /* mesmo sem resposta, volta para a tela de entrada */
    }
    navegar("/painel/entrar", { replace: true });
  }

  if (semSessao) return <Navigate to="/painel/entrar" replace />;
  if (falha) return <p className="p-8 text-center text-erro">{falha}</p>;
  if (!usuario) return <Carregando />;

  const soDono = ["/painel/servicos", "/painel/resumo", "/painel/equipe", "/painel/clientes"];
  if (usuario.papel !== "dono" && soDono.includes(semBarra(pathname))) {
    return <Navigate to="/painel" replace />;
  }

  return (
    <SessaoContexto.Provider value={usuario}>
      <div className="min-h-dvh bg-fundo">
        <BarraLateral aberta={menuAberto} aoFechar={fecharMenu} aoSair={() => void sair()} saindo={saindo} />
        <div className="flex min-h-dvh flex-col lg:pl-[260px]">
          <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-borda bg-superficie px-4 lg:hidden">
            <Logo tamanho={34} />
            <span className="bebas flex-1 truncate text-2xl leading-none">{itemAtual(pathname).nome}</span>
            <button
              type="button"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
              aria-expanded={menuAberto}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-superficie-alta"
            >
              <Icone nome="menu" />
            </button>
          </div>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </SessaoContexto.Provider>
  );
}

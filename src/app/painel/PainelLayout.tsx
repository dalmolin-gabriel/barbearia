import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { api, ErroApi } from "../api";
import { Carregando } from "../componentes/Carregando";
import { MenuInferior } from "../componentes/MenuInferior";
import { SessaoContexto, type UsuarioSessao } from "../sessao";

/** Casca do painel: confere a sessão e mostra o menu inferior. */
export default function PainelLayout() {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [semSessao, setSemSessao] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const { pathname } = useLocation();

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

  if (semSessao) return <Navigate to="/painel/entrar" replace />;
  if (falha) return <p className="p-8 text-center text-erro">{falha}</p>;
  if (!usuario) return <Carregando />;

  const soDono = ["/painel/servicos", "/painel/resumo", "/painel/equipe", "/painel/clientes"];
  if (usuario.papel !== "dono" && soDono.includes(pathname.replace(/\/$/, ""))) {
    return <Navigate to="/painel" replace />;
  }

  return (
    <SessaoContexto.Provider value={usuario}>
      <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-fundo">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <MenuInferior />
      </div>
    </SessaoContexto.Provider>
  );
}

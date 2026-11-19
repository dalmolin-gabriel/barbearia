import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Carregando } from "./componentes/Carregando";
import { Logo } from "./componentes/Logo";
import Agendar from "./cliente/Agendar";
import Pronto from "./cliente/Pronto";
import Privacidade from "./cliente/Privacidade";
import PainelLayout from "./painel/PainelLayout";

// Telas do painel são carregadas sob demanda: o cliente que só agenda não baixa o painel.
const Provisoria = lazy(() => import("./Provisoria"));

function Login() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 px-5 pt-8">
      <Logo tamanho={120} />
      <h1 className="bebas text-[34px]">Entrar</h1>
    </div>
  );
}

export function Rotas() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/" element={<Agendar />} />
          <Route path="/pronto/:id" element={<Pronto />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/painel/entrar" element={<Login />} />
          <Route path="/painel" element={<PainelLayout />}>
            <Route index element={<Provisoria titulo="Hoje" />} />
            <Route path="lembretes" element={<Provisoria titulo="Lembretes" />} />
            <Route path="servicos" element={<Provisoria titulo="Serviços" />} />
            <Route path="horarios" element={<Provisoria titulo="Horários" />} />
            <Route path="resumo" element={<Provisoria titulo="Resumo" />} />
            <Route path="equipe" element={<Provisoria titulo="Equipe" />} />
            <Route path="clientes" element={<Provisoria titulo="Clientes" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

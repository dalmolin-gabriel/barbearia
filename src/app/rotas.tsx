import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Carregando } from "./componentes/Carregando";
import Agendar from "./cliente/Agendar";
import Pronto from "./cliente/Pronto";
import Privacidade from "./cliente/Privacidade";
import PainelLayout from "./painel/PainelLayout";

// Telas do painel são carregadas sob demanda: o cliente que só agenda não baixa o painel.
const Login = lazy(() => import("./painel/Login"));
const PrimeiroAcesso = lazy(() => import("./painel/PrimeiroAcesso"));
const Hoje = lazy(() => import("./painel/Hoje"));
const Lembretes = lazy(() => import("./painel/Lembretes"));
const Servicos = lazy(() => import("./painel/Servicos"));
const Horarios = lazy(() => import("./painel/Horarios"));
const Resumo = lazy(() => import("./painel/Resumo"));
const Equipe = lazy(() => import("./painel/Equipe"));
const Clientes = lazy(() => import("./painel/Clientes"));

export function Rotas() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/" element={<Agendar />} />
          <Route path="/pronto/:id" element={<Pronto />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/painel/entrar" element={<Login />} />
          <Route path="/painel/primeiro-acesso" element={<PrimeiroAcesso />} />
          <Route path="/painel" element={<PainelLayout />}>
            <Route index element={<Hoje />} />
            <Route path="lembretes" element={<Lembretes />} />
            <Route path="servicos" element={<Servicos />} />
            <Route path="horarios" element={<Horarios />} />
            <Route path="resumo" element={<Resumo />} />
            <Route path="equipe" element={<Equipe />} />
            <Route path="clientes" element={<Clientes />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Carregando } from "./componentes/Carregando";
import Agendar from "./cliente/Agendar";
import MeuHorario from "./cliente/MeuHorario";
import Pronto from "./cliente/Pronto";
import Privacidade from "./cliente/Privacidade";
import PainelLayout from "./painel/PainelLayout";

// Telas do painel são carregadas sob demanda: o cliente que só agenda não baixa o painel.
const Login = lazy(() => import("./painel/Login"));
const Cadastro = lazy(() => import("./painel/Cadastro"));
const EsqueciSenha = lazy(() => import("./painel/EsqueciSenha"));
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
          <Route path="/meu-horario/:token" element={<MeuHorario />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/painel/entrar" element={<Login />} />
          <Route path="/painel/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/painel/cadastro" element={<Cadastro />} />
          <Route path="/painel/primeiro-acesso" element={<Navigate to="/painel/cadastro" replace />} />
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

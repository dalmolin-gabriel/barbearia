import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos.css";
import { Rotas } from "./rotas";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <Rotas />
  </StrictMode>,
);

// Service worker: necessário para as notificações push do painel.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

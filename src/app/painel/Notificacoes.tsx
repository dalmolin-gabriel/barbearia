import { useCallback, useEffect, useState } from "react";
import { api, mensagemDe } from "../api";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";

type Estado = "carregando" | "ativas" | "inativas" | "negadas" | "sem-suporte" | "ios-instalar";

const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const emModoApp = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const temSuporte = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function chaveParaBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function lerEstado(): Promise<Estado> {
  if (ehIphone() && !emModoApp()) return "ios-instalar";
  if (!temSuporte()) return "sem-suporte";
  if (Notification.permission === "denied") return "negadas";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "ativas" : "inativas";
  } catch {
    return "inativas";
  }
}

/**
 * Botão de ativar notificações push neste aparelho.
 * Com `soSeInativas`, some quando já estiver ativo (uso no topo de Hoje para o barbeiro).
 */
export default function Notificacoes({ soSeInativas = false }: { soSeInativas?: boolean }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void lerEstado().then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, []);

  const ativar = useCallback(async () => {
    setOcupado(true);
    setErro(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "negadas" : "inativas");
        return;
      }
      const { chave } = await api<{ chave: string }>("/api/push/chave");
      if (!chave) {
        setErro("As notificações ainda não foram configuradas no servidor.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) }));
      const { endpoint, keys } = sub.toJSON();
      await api("/api/push/inscrever", { corpo: { endpoint, keys } });
      setEstado("ativas");
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setOcupado(false);
    }
  }, []);

  const desativar = useCallback(async () => {
    setOcupado(true);
    setErro(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/inscrever", { metodo: "DELETE", corpo: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setEstado("inativas");
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setOcupado(false);
    }
  }, []);

  if (estado === "carregando") return null;
  if (soSeInativas && (estado === "ativas" || estado === "sem-suporte")) return null;

  return (
    <div className="cartao flex flex-col gap-2 p-3.5">
      <b className="text-[15px] font-semibold">🔔 Notificações neste celular</b>
      {estado === "ativas" ? (
        <>
          <p className="text-[13px] text-texto-suave">
            Ativadas. Você recebe todos os agendamentos e cancelamentos. Cada barbeiro recebe só os da própria agenda.
          </p>
          <Botao variante="secundario" pequeno disabled={ocupado} onClick={() => void desativar()}>
            Desativar notificações
          </Botao>
        </>
      ) : estado === "ios-instalar" ? (
        <p className="text-[13px] text-texto-suave">
          No iPhone: toque em Compartilhar → Adicionar à Tela de Início e abra pelo ícone.
        </p>
      ) : estado === "negadas" ? (
        <p className="text-[13px] text-texto-suave">
          As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador para receber os avisos.
        </p>
      ) : estado === "sem-suporte" ? (
        <p className="text-[13px] text-texto-suave">Este navegador não aceita notificações.</p>
      ) : (
        <>
          <p className="text-[13px] text-texto-suave">Receba um aviso a cada novo horário marcado ou cancelado.</p>
          <Botao pequeno disabled={ocupado} onClick={() => void ativar()}>
            Ativar notificações
          </Botao>
        </>
      )}
      {erro ? <Aviso>{erro}</Aviso> : null}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { api, mensagemDe } from "./api";
import { NOME_PADRAO } from "./util";

export type Carga<T> = {
  dados: T | null;
  erro: string | null;
  carregando: boolean;
  recarregar: () => Promise<void>;
};

/** Busca dados e refaz a busca quando `deps` mudam. Mantém os dados antigos enquanto recarrega. */
export function useCarregar<T>(buscar: () => Promise<T>, deps: DependencyList): Carga<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const versao = useRef(0);
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  const recarregar = useCallback(async () => {
    const minha = ++versao.current;
    try {
      const r = await buscarRef.current();
      if (minha !== versao.current) return;
      setDados(r);
      setErro(null);
    } catch (e) {
      if (minha !== versao.current) return;
      setErro(mensagemDe(e));
    } finally {
      if (minha === versao.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    setCarregando(true);
    void recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { dados, erro, carregando, recarregar };
}

/** Roda `fn` a cada `ms` e quando a aba volta ao foco. */
export function useAtualizar(fn: () => void, ms = 60_000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const t = window.setInterval(() => ref.current(), ms);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [ms]);
}

export type Info = {
  barbearia: { nome: string; whatsapp: string; endereco: string };
  servicos: { id: string; nome: string; duracao_min: number; preco_centavos: number }[];
  barbeiros: { id: string; nome: string }[];
  dias: string[];
  turnstileSiteKey: string;
};

let infoEmCache: Promise<Info> | null = null;
/** /api/publico/info com cache simples (uma busca por carregamento da página). */
export function buscarInfo(forcar = false): Promise<Info> {
  if (!infoEmCache || forcar) {
    infoEmCache = api<Info>("/api/publico/info");
    infoEmCache.catch(() => {
      infoEmCache = null;
    });
  }
  return infoEmCache;
}

/** Nome da barbearia (para as mensagens de WhatsApp); cai no nome padrão se a busca falhar. */
export function useNomeBarbearia(): string {
  const [nome, setNome] = useState(NOME_PADRAO);
  useEffect(() => {
    let vivo = true;
    buscarInfo()
      .then((i) => {
        if (vivo && i.barbearia.nome) setNome(i.barbearia.nome);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return nome;
}

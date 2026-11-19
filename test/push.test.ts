import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { req, criarUsuario } from "./ajuda";

// Terça-feira, 2026-12-01, 10:00 em Brasília = 13:00 UTC. O agendamento de 11:00 cai em "ter 01/12".
const AGORA = new Date("2026-12-01T13:00:00.000Z");
const TERCA = "2026-12-01";

const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

/** Par VAPID real (ECDSA P-256) no formato que a biblioteca espera. */
async function gerarVapid() {
  const par = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", par.privateKey)) as JsonWebKey;
  return { pub: b64url(await crypto.subtle.exportKey("raw", par.publicKey)), priv: jwk.d! };
}

/** Chaves de uma inscrição de navegador (ECDH P-256 + segredo de autenticação de 16 bytes). */
async function chavesInscricao() {
  const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { p256dh: b64url(await crypto.subtle.exportKey("raw", par.publicKey)), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) };
}

let barbeiro = { id: "" };
let outro = { id: "" };
let dono = { id: "", token: "" };
let corte = "";
const ENDP = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;
const envOriginal = { pub: env.VAPID_PUBLIC_KEY, priv: env.VAPID_PRIVATE_KEY, sub: env.VAPID_SUBJECT };

async function inscrever(usuarioId: string, endpoint: string) {
  const k = await chavesInscricao();
  await env.DB.prepare(
    "INSERT INTO push_inscricoes (id, usuario_id, endpoint, p256dh, auth, criado_em) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), usuarioId, endpoint, k.p256dh, k.auth, new Date().toISOString())
    .run();
}

async function semear() {
  for (const t of ["push_inscricoes", "atendimentos", "clientes", "bloqueios", "expediente", "servicos", "limites", "usuarios"])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  const mk = async (papel: "dono" | "barbeiro", nome: string, ativo = 1) => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO usuarios (id, nome, usuario, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, 'x', ?, ?, ?)",
    )
      .bind(id, nome, `u-${id.slice(0, 8)}`, papel, ativo, new Date().toISOString())
      .run();
    for (let dia = 2; dia <= 6; dia++)
      await env.DB.prepare(
        "INSERT INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min) VALUES (?, ?, 1, 540, 1140, 720, 780)",
      )
        .bind(id, dia)
        .run();
    return id;
  };
  barbeiro = { id: await mk("barbeiro", "Zé") };
  outro = { id: await mk("barbeiro", "Outro") };
  const d = await criarUsuario("dono");
  dono = { id: d.id, token: d.token };
  corte = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem) VALUES (?, 'Corte', 30, 4000, 1, 0)")
    .bind(corte)
    .run();
}

let chamadas: { url: string; init?: RequestInit }[] = [];
let status = 201;

function simularFetch() {
  chamadas = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (url.includes("challenges.cloudflare.com")) return new Response(JSON.stringify({ success: true }));
    chamadas.push({ url, init });
    return new Response(null, { status });
  });
}

const agendar = (ip: string) =>
  req("/api/publico/agendar", {
    metodo: "POST",
    ip,
    corpo: { barbeiro: barbeiro.id, servicos: [corte], data: TERCA, hora: "11:00", nome: "João da Silva", telefone: "(11) 91234-5678", aceite: true, turnstile: "t" },
  });

const envios = () => chamadas.map((c) => c.url).sort();
const esperarEnvios = (n: number) => vi.waitFor(() => expect(chamadas.length).toBeGreaterThanOrEqual(n));
const restantes = async () =>
  ((await env.DB.prepare("SELECT endpoint FROM push_inscricoes ORDER BY endpoint").all<{ endpoint: string }>()).results ?? []).map((r) => r.endpoint);

describe("notificações push", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
    const v = await gerarVapid();
    env.VAPID_PUBLIC_KEY = v.pub;
    env.VAPID_PRIVATE_KEY = v.priv;
    env.VAPID_SUBJECT = "mailto:contato@exemplo.com";
    status = 201;
    simularFetch();
    await semear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    env.VAPID_PUBLIC_KEY = envOriginal.pub;
    env.VAPID_PRIVATE_KEY = envOriginal.priv;
    env.VAPID_SUBJECT = envOriginal.sub;
  });

  it("agendamento público envia ao barbeiro e ao dono, e a nenhum outro barbeiro", async () => {
    await inscrever(barbeiro.id, ENDP("barbeiro"));
    await inscrever(dono.id, ENDP("dono"));
    await inscrever(outro.id, ENDP("outro"));
    const r = await agendar("10.1.0.1");
    expect(r.status).toBe(201);
    await esperarEnvios(2);
    expect(envios()).toEqual([ENDP("barbeiro"), ENDP("dono")]);
    expect(chamadas.every((c) => c.init?.method?.toUpperCase() === "POST")).toBe(true);
  });

  it("dono que também é o barbeiro do atendimento recebe uma vez; dono inativo não recebe", async () => {
    await inscrever(dono.id, ENDP("dono"));
    const inativo = await criarUsuario("dono", { ativo: false });
    await inscrever(inativo.id, ENDP("inativo"));
    await env.DB.prepare("UPDATE usuarios SET nome = 'Dono Barbeiro' WHERE id = ?").bind(dono.id).run();
    for (let dia = 2; dia <= 6; dia++)
      await env.DB.prepare(
        "INSERT INTO expediente (usuario_id, dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min) VALUES (?, ?, 1, 540, 1140, 720, 780)",
      )
        .bind(dono.id, dia)
        .run();
    const r = await req("/api/publico/agendar", {
      metodo: "POST",
      ip: "10.1.0.2",
      corpo: { barbeiro: dono.id, servicos: [corte], data: TERCA, hora: "11:00", nome: "Ana", telefone: "(11) 91234-5678", aceite: true, turnstile: "t" },
    });
    expect(r.status).toBe(201);
    await esperarEnvios(1);
    await new Promise((ok) => setTimeout(ok, 50));
    expect(envios()).toEqual([ENDP("dono")]);
  });

  it("resposta 410 e 404 apagam a inscrição; outros erros não", async () => {
    await inscrever(barbeiro.id, ENDP("barbeiro"));
    await inscrever(dono.id, ENDP("dono"));
    status = 410;
    await agendar("10.1.0.3");
    await vi.waitFor(async () => expect(await restantes()).toEqual([]));

    await inscrever(barbeiro.id, ENDP("b2"));
    const { notificarNovoAgendamento } = await import("../src/worker/push/notificar");
    const id = (await env.DB.prepare("SELECT id FROM atendimentos").first<{ id: string }>())!.id;
    status = 404;
    await notificarNovoAgendamento(env, id);
    expect(await restantes()).toEqual([]);

    await inscrever(barbeiro.id, ENDP("b3"));
    status = 500;
    await notificarNovoAgendamento(env, id);
    expect(await restantes()).toEqual([ENDP("b3")]);
  });

  it("erro no envio não muda o 201 do agendamento", async () => {
    await inscrever(barbeiro.id, ENDP("barbeiro"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada) => {
      const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      if (url.includes("challenges.cloudflare.com")) return new Response(JSON.stringify({ success: true }));
      throw new Error("rede caiu");
    });
    const r = await agendar("10.1.0.4");
    expect(r.status).toBe(201);
    // Espera o envio em segundo plano terminar (e ser registrado) antes de encerrar o teste.
    await vi.waitFor(() => expect(erro).toHaveBeenCalled());
    expect(await restantes()).toEqual([ENDP("barbeiro")]);
    erro.mockRestore();
  });

  it("sem chaves VAPID não envia nada, e a chave pública vem vazia", async () => {
    env.VAPID_PUBLIC_KEY = "";
    env.VAPID_PRIVATE_KEY = "";
    await inscrever(barbeiro.id, ENDP("barbeiro"));
    expect((await agendar("10.1.0.5")).status).toBe(201);
    await new Promise((ok) => setTimeout(ok, 50));
    expect(chamadas).toEqual([]);
    const r = await req("/api/push/chave", { ip: "10.1.0.6" });
    expect(await r.json()).toEqual({ chave: "" });
  });

  it("o corpo da notificação vai criptografado e a chave pública é exposta", async () => {
    await inscrever(barbeiro.id, ENDP("barbeiro"));
    await agendar("10.1.0.7");
    await esperarEnvios(1);
    const init = chamadas[0]!.init!;
    expect(init.body).toBeInstanceOf(Uint8Array);
    expect(JSON.stringify(init.headers)).toMatch(/vapid/i);
    const r = await req("/api/push/chave");
    expect(await r.json()).toEqual({ chave: env.VAPID_PUBLIC_KEY });
  });

  it("monta o texto no horário de Brasília", async () => {
    const { montarMensagem } = await import("../src/worker/push/notificar");
    const m = JSON.parse(
      montarMensagem(
        { cliente: "João da Silva", servicos_txt: "Corte + Barba", inicio: "2026-12-03T14:00:00.000Z", barbeiro: "Zé", usuario_id: "x" },
        "abc",
      ),
    );
    expect(m).toEqual({
      title: "Novo horário marcado",
      body: "João da Silva · Corte + Barba · qui 03/12 às 11:00 · com Zé",
      data: { url: "/painel?atendimento=abc" },
    });
  });

  it("não envia para usuário desativado (barbeiro ou dono) nem para endpoint fora da lista", async () => {
    await inscrever(barbeiro.id, ENDP("barbeiro"));
    await inscrever(dono.id, "https://interno.exemplo.com/x");
    await env.DB.prepare("UPDATE usuarios SET ativo = 0 WHERE id = ?").bind(barbeiro.id).run();
    const { notificarNovoAgendamento } = await import("../src/worker/push/notificar");
    await env.DB.prepare("UPDATE usuarios SET ativo = 1 WHERE id = ?").bind(barbeiro.id).run();
    expect((await agendar("10.1.0.8")).status).toBe(201);
    const id = (await env.DB.prepare("SELECT id FROM atendimentos").first<{ id: string }>())!.id;
    await vi.waitFor(() => expect(chamadas.length).toBe(1));
    chamadas.length = 0;
    await env.DB.prepare("UPDATE usuarios SET ativo = 0 WHERE id = ?").bind(barbeiro.id).run();
    await notificarNovoAgendamento(env, id);
    expect(chamadas).toEqual([]);
  });

  describe("rotas de inscrição", () => {
    it("rejeita endpoint fora dos serviços de push conhecidos", async () => {
      const keys = await chavesInscricao();
      for (const endpoint of [
        "https://push.exemplo.com/x",
        "https://localhost/x",
        "https://fcm.googleapis.com.atacante.com/x",
        "https://evilpush.apple.com.br/x",
      ]) {
        const r = await req("/api/push/inscrever", { metodo: "POST", corpo: { endpoint, keys }, token: dono.token });
        expect(r.status).toBe(400);
        expect(await r.json()).toEqual({ erro: "Endereço de notificação não permitido." });
      }
      for (const endpoint of [
        "https://updates.push.services.mozilla.com/wpush/v2/a",
        "https://web.push.apple.com/a",
        "https://x.push.apple.com/a",
        "https://abc.notify.windows.com/a",
      ])
        expect((await req("/api/push/inscrever", { metodo: "POST", corpo: { endpoint, keys }, token: dono.token })).status).toBe(200);
    });

    it("guarda no máximo 10 inscrições por usuário, removendo as mais antigas", async () => {
      for (let n = 0; n < 12; n++) {
        const r = await req("/api/push/inscrever", {
          metodo: "POST",
          corpo: { endpoint: ENDP(`n${String(n).padStart(2, "0")}`), keys: await chavesInscricao() },
          token: dono.token,
        });
        expect(r.status).toBe(200);
      }
      const r = await restantes();
      expect(r).toHaveLength(10);
      expect(r).not.toContain(ENDP("n00"));
      expect(r).not.toContain(ENDP("n01"));
      expect(r).toContain(ENDP("n11"));
    });

    const k = async () => ({ endpoint: ENDP("novo"), keys: await chavesInscricao() });

    it("exige login", async () => {
      expect((await req("/api/push/inscrever", { metodo: "POST", corpo: await k() })).status).toBe(401);
      expect((await req("/api/push/inscrever", { metodo: "DELETE", corpo: { endpoint: ENDP("x") } })).status).toBe(401);
    });

    it("inscreve e faz upsert por endpoint", async () => {
      const corpo = await k();
      expect((await req("/api/push/inscrever", { metodo: "POST", corpo, token: dono.token })).status).toBe(200);
      const novas = await chavesInscricao();
      expect((await req("/api/push/inscrever", { metodo: "POST", corpo: { ...corpo, keys: novas }, token: dono.token })).status).toBe(200);
      const linhas = (await env.DB.prepare("SELECT * FROM push_inscricoes").all<any>()).results!;
      expect(linhas).toHaveLength(1);
      expect(linhas[0].p256dh).toBe(novas.p256dh);
      expect(linhas[0].usuario_id).toBe(dono.id);
    });

    it("rejeita corpo inválido", async () => {
      const keys = await chavesInscricao();
      const ruins = [
        { endpoint: "http://push.exemplo.com/x", keys },
        { endpoint: "https://push.exemplo.com/" + "a".repeat(2050), keys },
        { endpoint: ENDP("x"), keys: { ...keys, auth: "não é base64url!" } },
        { endpoint: ENDP("x"), keys: { ...keys, p256dh: "a".repeat(257) } },
        { endpoint: ENDP("x") },
      ];
      for (const corpo of ruins)
        expect((await req("/api/push/inscrever", { metodo: "POST", corpo, token: dono.token })).status).toBe(400);
      expect(await restantes()).toEqual([]);
    });

    it("DELETE remove só a inscrição do próprio usuário", async () => {
      await inscrever(barbeiro.id, ENDP("alheia"));
      await inscrever(dono.id, ENDP("minha"));
      await req("/api/push/inscrever", { metodo: "DELETE", corpo: { endpoint: ENDP("alheia") }, token: dono.token });
      expect(await restantes()).toEqual([ENDP("alheia"), ENDP("minha")]);
      const r = await req("/api/push/inscrever", { metodo: "DELETE", corpo: { endpoint: ENDP("minha") }, token: dono.token });
      expect(r.status).toBe(200);
      expect(await restantes()).toEqual([ENDP("alheia")]);
    });

    it("o mesmo aparelho em outra conta passa a pertencer a quem acabou de entrar", async () => {
      await inscrever(barbeiro.id, ENDP("novo"));
      const r = await req("/api/push/inscrever", { metodo: "POST", corpo: await k(), token: dono.token });
      expect(r.status).toBe(200);
      const l = (await env.DB.prepare("SELECT usuario_id FROM push_inscricoes").all<any>()).results!;
      expect(l).toEqual([{ usuario_id: dono.id }]);
    });
  });
});

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/worker/index";
import { conferirSenha } from "../src/worker/seguranca/senha";
// @ts-expect-error script em JS puro, sem tipos
import { gerarHash } from "../scripts/hash-senha.mjs";
import { req, tokenDoCookie } from "./ajuda";

const CODIGO = "codigo-de-teste-123";
const dados = { codigo: CODIGO, nome: "Seu Padilha", usuario: "padilha", senha: "senha-forte-1" };

let proximoIp = 0;
const criar = (corpo: unknown, ip = `198.51.100.${++proximoIp}`) =>
  req("/api/primeiro-acesso", { metodo: "POST", corpo, ip });

const contar = async (tabela: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).first<{ n: number }>())?.n;

beforeEach(async () => {
  // O banco é compartilhado entre os testes do arquivo: volta ao estado "sem usuários".
  await env.DB.batch([
    env.DB.prepare("DELETE FROM servicos"),
    env.DB.prepare("DELETE FROM usuarios"),
    env.DB.prepare("DELETE FROM limites"),
  ]);
});

describe("primeiro acesso", () => {
  it("sem usuários e com o código certo: 201, cria dono, expediente e serviços, e já entra", async () => {
    const r = await criar(dados);
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as { usuario: { papel: string } };
    expect(corpo.usuario.papel).toBe("dono");
    const token = tokenDoCookie(r);
    expect(token).toBeTruthy();
    expect((await req("/api/auth/eu", { token: token! })).status).toBe(200);

    const dono = await env.DB.prepare("SELECT id, papel, senha_hash FROM usuarios").first<{
      id: string;
      papel: string;
      senha_hash: string;
    }>();
    expect(dono?.papel).toBe("dono");
    expect(await conferirSenha(dados.senha, dono!.senha_hash)).toBe(true);

    const { results: dias } = await env.DB.prepare(
      "SELECT dia_semana, aberto, inicio_min, fim_min, almoco_ini_min, almoco_fim_min FROM expediente WHERE usuario_id = ? ORDER BY dia_semana",
    )
      .bind(dono!.id)
      .all();
    expect(dias).toHaveLength(7);
    expect(dias[0]).toMatchObject({ aberto: 0 });
    expect(dias[1]).toEqual({ dia_semana: 1, aberto: 1, inicio_min: 540, fim_min: 1140, almoco_ini_min: 720, almoco_fim_min: 780 });
    expect(dias[6]).toMatchObject({ aberto: 1 });

    const { results: servicos } = await env.DB.prepare(
      "SELECT nome, duracao_min, preco_centavos, ativo FROM servicos ORDER BY ordem",
    ).all();
    expect(servicos).toEqual([
      { nome: "Corte", duracao_min: 30, preco_centavos: 0, ativo: 1 },
      { nome: "Barba", duracao_min: 20, preco_centavos: 0, ativo: 1 },
      { nome: "Corte + Barba", duracao_min: 50, preco_centavos: 0, ativo: 1 },
    ]);

    // E o login normal também funciona.
    const login = await req("/api/auth/entrar", {
      metodo: "POST",
      corpo: { usuario: "padilha", senha: dados.senha },
      ip: "203.0.113.9",
    });
    expect(login.status).toBe(200);
  });

  it("GET informa se está disponível", async () => {
    expect(await (await req("/api/primeiro-acesso")).json()).toEqual({ disponivel: true });
    await criar(dados);
    expect(await (await req("/api/primeiro-acesso")).json()).toEqual({ disponivel: false });
  });

  it("código errado: 403 e nada é criado", async () => {
    const r = await criar({ ...dados, codigo: "errado" });
    expect(r.status).toBe(403);
    expect(await contar("usuarios")).toBe(0);
  });

  it("segunda chamada, com o dono já criado: 404", async () => {
    expect((await criar(dados)).status).toBe(201);
    expect((await criar({ ...dados, usuario: "outro" })).status).toBe(404);
    expect(await contar("usuarios")).toBe(1);
  });

  it("sem CODIGO_INSTALACAO configurado: 404 (POST) e indisponível (GET)", async () => {
    const cabecalhos = { Origin: "https://exemplo.com", "Content-Type": "application/json" };
    const post = (ambiente: object, corpo: object) =>
      app.fetch(
        new Request("https://exemplo.com/api/primeiro-acesso", { method: "POST", headers: cabecalhos, body: JSON.stringify(corpo) }),
        ambiente as typeof env,
      );
    expect((await post({ ...env, CODIGO_INSTALACAO: undefined }, dados)).status).toBe(404);
    expect((await post({ ...env, CODIGO_INSTALACAO: "" }, { ...dados, codigo: "" })).status).toBe(404);
    const get = await app.fetch(new Request("https://exemplo.com/api/primeiro-acesso"), { ...env, CODIGO_INSTALACAO: undefined } as typeof env);
    expect(await get.json()).toEqual({ disponivel: false });
    expect(await contar("usuarios")).toBe(0);
  });

  it("valida nome, usuário e senha (400)", async () => {
    for (const ruim of [
      { ...dados, nome: "" },
      { ...dados, nome: "x".repeat(61) },
      { ...dados, usuario: "a b" },
      { ...dados, usuario: "ab" },
      { ...dados, senha: "curta" },
      { ...dados, senha: undefined },
    ])
      expect((await criar(ruim)).status).toBe(400);
    expect(await contar("usuarios")).toBe(0);
  });

  it("limita a 5 tentativas por hora por IP (429)", async () => {
    const ip = "192.0.2.77";
    for (let i = 0; i < 5; i++) expect((await criar({ ...dados, codigo: "errado" }, ip)).status).toBe(403);
    expect((await criar(dados, ip)).status).toBe(429);
    // Outro IP não é afetado.
    expect((await criar(dados, "192.0.2.78")).status).toBe(201);
  });

  it("chamadas simultâneas criam exatamente um dono", async () => {
    const respostas = await Promise.all([
      criar(dados, "192.0.2.1"),
      criar({ ...dados, usuario: "outro-dono" }, "192.0.2.2"),
      criar({ ...dados, usuario: "mais-um" }, "192.0.2.3"),
    ]);
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 404, 404]);
    expect(await contar("usuarios")).toBe(1);
    expect(await contar("servicos")).toBe(3);
    expect(await contar("expediente")).toBe(7);
  });
});

describe("scripts/hash-senha.mjs", () => {
  it("o hash do script confere com conferirSenha", async () => {
    const hash = await gerarHash("minha-senha-nova");
    expect(hash).toMatch(/^pbkdf2\$100000\$[^$]+\$[^$]+$/);
    expect(await conferirSenha("minha-senha-nova", hash)).toBe(true);
    expect(await conferirSenha("outra", hash)).toBe(false);
  });

  it("aceita um hash gerado de verdade pelo Node (vetor fixo)", async () => {
    expect(await conferirSenha("abc12345", VETOR_NODE)).toBe(true);
  });
});

// Gerado com: node scripts/hash-senha.mjs 'abc12345'
const VETOR_NODE = "pbkdf2$100000$zKGkVSwnRQSQvRO3zJZvzw==$EK3CCgpu465MQG0VcfrNzJfXCRAbcoz5tZVLTIKm9I8=";

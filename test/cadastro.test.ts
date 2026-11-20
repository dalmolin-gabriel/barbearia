import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { conferirSenha } from "../src/worker/seguranca/senha";
import { req, tokenDoCookie } from "./ajuda";

const dados = { nome: "Seu Padilha", email: "padilha@exemplo.com", senha: "senha-forte-1" };

let proximoIp = 0;
const criar = (corpo: unknown, ip = `198.51.100.${++proximoIp}`) =>
  req("/api/cadastro", { metodo: "POST", corpo, ip });

const contar = async (tabela: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).first<{ n: number }>())?.n;

beforeEach(async () => {
  // O banco é compartilhado entre os testes do arquivo: volta ao estado "sem usuários".
  await env.DB.batch([
    env.DB.prepare("DELETE FROM servicos"),
    env.DB.prepare("DELETE FROM sessoes"),
    env.DB.prepare("DELETE FROM usuarios"),
    env.DB.prepare("DELETE FROM limites"),
  ]);
});

describe("cadastro da primeira conta", () => {
  it("sem usuários: 201, cria dono, expediente e serviços, e já entra", async () => {
    const r = await criar({ ...dados, email: "  Padilha@Exemplo.com " });
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as { usuario: { papel: string } };
    expect(corpo.usuario.papel).toBe("dono");
    const token = tokenDoCookie(r);
    expect(token).toBeTruthy();
    expect(r.headers.get("Set-Cookie") ?? "").toContain("HttpOnly");
    expect((await req("/api/auth/eu", { token: token! })).status).toBe(200);

    const dono = await env.DB.prepare("SELECT id, usuario, papel, senha_hash FROM usuarios").first<{
      id: string;
      usuario: string;
      papel: string;
      senha_hash: string;
    }>();
    expect(dono?.papel).toBe("dono");
    expect(dono?.usuario).toBe("padilha@exemplo.com");
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

    // E o login normal também funciona, com o e-mail.
    const login = await req("/api/auth/entrar", {
      metodo: "POST",
      corpo: { email: "padilha@exemplo.com", senha: dados.senha },
      ip: "203.0.113.9",
    });
    expect(login.status).toBe(200);
  });

  it("não mexe nos serviços que já existem", async () => {
    await env.DB.prepare(
      "INSERT INTO servicos (id, nome, duracao_min, preco_centavos, ativo, ordem) VALUES ('s1', 'Sobrancelha', 15, 1500, 1, 0)",
    ).run();
    expect((await criar(dados)).status).toBe(201);
    const { results } = await env.DB.prepare("SELECT nome FROM servicos").all();
    expect(results).toEqual([{ nome: "Sobrancelha" }]);
  });

  it("GET informa se está disponível", async () => {
    expect(await (await req("/api/cadastro")).json()).toEqual({ disponivel: true });
    await criar(dados);
    expect(await (await req("/api/cadastro")).json()).toEqual({ disponivel: false });
  });

  it("segundo cadastro, com a conta já criada: 404", async () => {
    expect((await criar(dados)).status).toBe(201);
    expect((await criar({ ...dados, email: "outro@exemplo.com" })).status).toBe(404);
    expect(await contar("usuarios")).toBe(1);
  });

  it("valida nome, e-mail e senha (400)", async () => {
    for (const ruim of [
      { ...dados, nome: "" },
      { ...dados, nome: "x".repeat(61) },
      { ...dados, email: "padilha" },
      { ...dados, email: "a b@exemplo.com" },
      { ...dados, email: `${"a".repeat(250)}@x.com` },
      { ...dados, senha: "curta" },
      { ...dados, senha: undefined },
    ])
      expect((await criar(ruim)).status).toBe(400);
    expect(await contar("usuarios")).toBe(0);
  });

  it("limita a 5 tentativas por hora por IP (429)", async () => {
    const ip = "192.0.2.77";
    for (let i = 0; i < 5; i++) expect((await criar({ ...dados, senha: "curta" }, ip)).status).toBe(400);
    expect((await criar(dados, ip)).status).toBe(429);
    // Outro IP não é afetado.
    expect((await criar(dados, "192.0.2.78")).status).toBe(201);
  });

  it("corpo grande demais: 413", async () => {
    expect((await criar({ ...dados, nome: "x".repeat(9000) })).status).toBe(413);
  });

  it("chamadas simultâneas criam exatamente um dono", async () => {
    const respostas = await Promise.all([
      criar(dados, "192.0.2.1"),
      criar({ ...dados, email: "outro-dono@exemplo.com" }, "192.0.2.2"),
      criar({ ...dados, email: "mais-um@exemplo.com" }, "192.0.2.3"),
    ]);
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 404, 404]);
    expect(await contar("usuarios")).toBe(1);
    expect(await contar("servicos")).toBe(3);
    expect(await contar("expediente")).toBe(7);
  });
});

import { describe, expect, it } from "vitest";
import { conferirSenha } from "../src/worker/seguranca/senha";
// @ts-expect-error script em JS puro, sem tipos
import { gerarHash } from "../scripts/hash-senha.mjs";

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

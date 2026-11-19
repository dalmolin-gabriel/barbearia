import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/saude", () => {
  it("responde 200 com { ok: true }", async () => {
    const resposta = await SELF.fetch("https://exemplo.com/api/saude");
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true });
  });
});

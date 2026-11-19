import { describe, expect, it } from "vitest";
import { formatarTelefone, normalizarTelefone } from "../src/shared/telefone";
import { linkWhatsapp, textoLembrete } from "../src/shared/mensagens";

describe("normalizarTelefone", () => {
  it("normaliza as formas comuns para 55 + DDD + número", () => {
    expect(normalizarTelefone("(48) 99999-1234")).toBe("5548999991234");
    expect(normalizarTelefone("48999991234")).toBe("5548999991234");
    expect(normalizarTelefone("+55 48 99999-1234")).toBe("5548999991234");
  });

  it("rejeita entradas inválidas", () => {
    expect(normalizarTelefone("4899991234")).toBeNull();
    expect(normalizarTelefone("abc")).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone("48899991234")).toBeNull(); // celular sem 9
    expect(normalizarTelefone("0899991234")).toBeNull();
    expect(normalizarTelefone("10999991234")).toBeNull(); // DDD < 11
    expect(normalizarTelefone("5648999991234")).toBeNull(); // 13 dígitos sem 55
  });
});

describe("formatarTelefone", () => {
  it("formata para exibição", () => {
    expect(formatarTelefone("5548999991234")).toBe("(48) 99999-1234");
  });
});

describe("mensagens", () => {
  const a = {
    cliente: "João",
    data: "2026-11-20",
    hora: "10:00",
    servico: "corte",
    barbeiro: "Zé",
    barbearia: "Barbearia X",
  };

  it("usa hoje, amanhã ou dd/mm", () => {
    expect(textoLembrete(a, "2026-11-19")).toContain("amanhã");
    expect(textoLembrete(a, "2026-11-20")).toContain("hoje");
    expect(textoLembrete(a, "2026-11-10")).toContain("20/11");
    expect(textoLembrete(a, "2026-11-19")).toBe(
      "Fala, João! Lembrando do seu corte amanhã às 10:00 com o Zé na Barbearia X. Posso confirmar? ✂️",
    );
  });

  it("codifica espaços como %20 no link", () => {
    const l = linkWhatsapp("5548999991234", "oi tudo bem");
    expect(l).toBe("https://wa.me/5548999991234?text=oi%20tudo%20bem");
  });
});

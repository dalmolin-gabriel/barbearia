import { describe, expect, it } from "vitest";
import { formatarReais, lerReais } from "../src/shared/dinheiro";

describe("lerReais", () => {
  it("aceita as formas comuns de digitar", () => {
    expect(lerReais("12,50")).toBe(1250);
    expect(lerReais("12.50")).toBe(1250);
    expect(lerReais("12")).toBe(1200);
    expect(lerReais("R$ 12,50")).toBe(1250);
    expect(lerReais("1.234,50")).toBe(123450);
    expect(lerReais("1.234")).toBe(123400);
    expect(lerReais("0,05")).toBe(5);
    expect(lerReais("0")).toBe(0);
  });

  it("rejeita o que não é valor", () => {
    expect(lerReais("")).toBeNull();
    expect(lerReais("abc")).toBeNull();
    expect(lerReais("-5")).toBeNull();
    expect(lerReais("12,345")).toBeNull();
    expect(lerReais("100001")).toBeNull();
  });
});

describe("formatarReais", () => {
  it("sempre mostra os centavos", () => {
    expect(formatarReais(1250)).toBe("R$ 12,50");
    expect(formatarReais(4000)).toBe("R$ 40,00");
    expect(formatarReais(123450)).toBe("R$ 1.234,50");
  });
});

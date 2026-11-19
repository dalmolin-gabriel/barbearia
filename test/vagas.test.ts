import { describe, expect, it } from "vitest";
import { calcularVagas } from "../src/shared/vagas";

const expediente = {
  aberto: true,
  inicioMin: 540,
  fimMin: 1140,
  almocoIniMin: 720,
  almocoFimMin: 780,
};
const base = {
  duracaoMin: 50,
  expediente,
  ocupados: [{ ini: 840, fim: 890 }],
  agoraMin: null,
};

describe("calcularVagas", () => {
  it("respeita expediente, almoço e ocupados em dia futuro", () => {
    const v = calcularVagas(base);
    expect(v).toContain(540);
    expect(v).toContain(660);
    expect(v).not.toContain(675);
    expect(v).not.toContain(735);
    expect(v).toContain(780);
    expect(v).not.toContain(795);
    expect(v).toContain(890);
    expect(v[v.length - 1]).toBe(1090);
  });

  it("aplica a antecedência mínima quando é hoje", () => {
    expect(calcularVagas({ ...base, agoraMin: 600 })[0]).toBe(630);
  });

  it("devolve vazio sem expediente ou com a barbearia fechada", () => {
    expect(calcularVagas({ ...base, expediente: null })).toEqual([]);
    expect(
      calcularVagas({ ...base, expediente: { ...expediente, aberto: false } }),
    ).toEqual([]);
  });

  it("funciona sem almoço", () => {
    const v = calcularVagas({
      ...base,
      ocupados: [],
      expediente: { ...expediente, almocoIniMin: null, almocoFimMin: null },
    });
    expect(v).toContain(675);
  });

  it("mantém a grade do expediente ao arredondar a antecedência", () => {
    // agora 10:07 + 30 = 10:37 -> próximo ponto da grade é 10:45
    expect(calcularVagas({ ...base, agoraMin: 607 })[0]).toBe(645);
  });
});

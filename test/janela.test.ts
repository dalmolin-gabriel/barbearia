import { describe, expect, it } from "vitest";
import { diasAbertosCliente } from "../src/shared/janela";
import { diaSemanaDe, hhmm, instanteUTC, partesLocais, somarDias } from "../src/shared/tempo";

const cfg = { aberturaDia: 6, aberturaMinuto: 23 * 60 };
const semanaSeguinte = [
  "2026-12-07",
  "2026-12-08",
  "2026-12-09",
  "2026-12-10",
  "2026-12-11",
  "2026-12-12",
];

describe("diasAbertosCliente", () => {
  it("terça 10:00 vai até sábado", () => {
    expect(diasAbertosCliente(instanteUTC("2026-12-01", 600), cfg)).toEqual([
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
    ]);
  });
  it("sábado 22:59 só tem o próprio sábado", () => {
    expect(diasAbertosCliente(instanteUTC("2026-12-05", 22 * 60 + 59), cfg)).toEqual(["2026-12-05"]);
  });
  it("sábado 23:00 abre a semana seguinte", () => {
    expect(diasAbertosCliente(instanteUTC("2026-12-05", 23 * 60), cfg)).toEqual([
      "2026-12-05",
      ...semanaSeguinte,
    ]);
  });
  it("sábado 23:30 (já domingo em UTC) usa o horário de Brasília", () => {
    expect(diasAbertosCliente(instanteUTC("2026-12-05", 23 * 60 + 30), cfg)).toEqual([
      "2026-12-05",
      ...semanaSeguinte,
    ]);
  });
  it("domingo mostra a semana seguinte", () => {
    expect(diasAbertosCliente(instanteUTC("2026-12-06", 9 * 60), cfg)).toEqual(semanaSeguinte);
  });
  it("segunda 08:00 vai até sábado", () => {
    expect(diasAbertosCliente(instanteUTC("2026-12-07", 8 * 60), cfg)).toEqual(semanaSeguinte);
  });
});

describe("tempo", () => {
  it("partesLocais converte UTC para Brasília", () => {
    expect(partesLocais(new Date("2026-12-06T02:30:00.000Z"))).toEqual({
      data: "2026-12-05",
      minutos: 1410,
      diaSemana: 6,
    });
  });
  it("instanteUTC e partesLocais são inversos", () => {
    expect(instanteUTC("2026-12-05", 1410).toISOString()).toBe("2026-12-06T02:30:00.000Z");
  });
  it("auxiliares de data", () => {
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(diaSemanaDe("2026-12-06")).toBe(0);
    expect(hhmm(545)).toBe("09:05");
  });
});

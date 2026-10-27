import { describe, expect, it } from "vitest";
import { matchConfidence, modelCodes } from "../lib/market-match";

describe("modelCodes", () => {
  it("pega códigos de modelo e ignora medidas", () => {
    expect([...modelCodes("Máquina de Lavar 14 Kg Philco Preto PLR14B 12 Programas")]).toEqual(["plr14b"]);
    expect([...modelCodes("Smart TV LG 55UR8750PSA 55 polegadas 220V 128GB")]).toEqual(["55ur8750psa"]);
  });
});

describe("matchConfidence", () => {
  it("mesmo código de barras é certeza; diferente é zero", () => {
    expect(matchConfidence({ title: "a", gtin: "07891234567890" }, { title: "b", gtin: "7891234567890" })).toBe(1);
    expect(matchConfidence({ title: "a", gtin: "7891234567890" }, { title: "a", gtin: "7891234567891" })).toBe(0);
  });
  it("mesmo modelo e nomes parecidos: aceita", () => {
    const c = matchConfidence(
      { title: "Máquina de Lavar 14 Kg Philco Preto PLR14B 12 Programas de Lavagem" },
      { title: "Lavadora De Roupas Philco PLR14B 14kg Preta 220V" },
    );
    expect(c).toBeGreaterThanOrEqual(0.7);
  });
  it("sem código de modelo em comum: recusa", () => {
    expect(matchConfidence({ title: "Caixa de Som Redragon Gamer Calliope RGB Preto" }, { title: "Caixa de Som Redragon Gamer Anvil GS520" })).toBe(0);
  });
  it("capacidade ou voltagem diferente: recusa", () => {
    expect(matchConfidence({ title: "Smartphone Galaxy A55 SM-A556E 128GB" }, { title: "Smartphone Galaxy A55 SM-A556E 256GB" })).toBe(0);
    expect(matchConfidence({ title: "Liquidificador Mondial L1200 220V" }, { title: "Liquidificador Mondial L1200 110V" })).toBe(0);
  });
});

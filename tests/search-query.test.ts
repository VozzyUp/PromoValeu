import { describe, expect, it } from "vitest";
import { searchTsQuery } from "../lib/search-query";

describe("searchTsQuery", () => {
  it("singular e plural viram o mesmo termo", () => {
    expect(searchTsQuery("pneu")).toBe("pneu:*");
    expect(searchTsQuery("Pneus")).toBe("pneu:*");
  });
  it("junta várias palavras com &", () => {
    expect(searchTsQuery("Kit 02 Pneus")).toBe("kit:* & 02:* & pneu:*");
  });
  it("palavra curta mantém o s e acento", () => {
    expect(searchTsQuery("gás")).toBe("gás:*");
  });
  it("remove operadores", () => {
    expect(searchTsQuery("a & b | !c")).toBe("a:* & b:* & c:*");
  });
  it("sem palavras retorna null", () => {
    expect(searchTsQuery("")).toBeNull();
    expect(searchTsQuery("!!!")).toBeNull();
  });
  it("limita a 8 termos", () => {
    expect(searchTsQuery("a b c d e f g h i j")!.split(" & ")).toHaveLength(8);
  });
});

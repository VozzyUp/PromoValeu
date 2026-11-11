import { describe, expect, it } from "vitest";
import { searchFilters } from "../lib/search-query";

describe("searchFilters", () => {
  it("palavra com 3+ letras: contém no título OU prefixo na busca de texto", () => {
    expect(searchFilters("pneu")).toEqual(["title.ilike.*pneu*,search.fts(pt_unaccent).pneu:*"]);
  });
  it("plural perde o s final (4+ letras) nos dois termos", () => {
    expect(searchFilters("Pneus")).toEqual(["title.ilike.*pneu*,search.fts(pt_unaccent).pneu:*"]);
  });
  it("uma regra por palavra", () => {
    expect(searchFilters("Kit 02 Pneus")).toEqual([
      "title.ilike.*kit*,search.fts(pt_unaccent).kit:*",
      "search.fts(pt_unaccent).02:*",
      "title.ilike.*pneu*,search.fts(pt_unaccent).pneu:*",
    ]);
  });
  it("palavra de 1-2 letras só usa a busca de texto", () => {
    expect(searchFilters("ar tv")).toEqual([
      "search.fts(pt_unaccent).ar:*",
      "search.fts(pt_unaccent).tv:*",
    ]);
  });
  it("palavra curta mantém o s e o acento", () => {
    expect(searchFilters("gás")).toEqual(["title.ilike.*gás*,search.fts(pt_unaccent).gás:*"]);
  });
  it("remove operadores e caracteres reservados", () => {
    expect(searchFilters("a & b | !c, (d)*")).toEqual([
      "search.fts(pt_unaccent).a:*",
      "search.fts(pt_unaccent).b:*",
      "search.fts(pt_unaccent).c:*",
      "search.fts(pt_unaccent).d:*",
    ]);
  });
  it("sem palavras retorna null", () => {
    expect(searchFilters("")).toBeNull();
    expect(searchFilters("!!!")).toBeNull();
  });
  it("limita a 8 palavras", () => {
    expect(searchFilters("a b c d e f g h i j")).toHaveLength(8);
  });
});

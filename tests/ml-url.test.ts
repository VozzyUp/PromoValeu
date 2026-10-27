import { describe, expect, it } from "vitest";
import { parseMlUrl } from "../lib/ml-url";

describe("parseMlUrl", () => {
  it("anúncio", () => {
    expect(parseMlUrl("https://produto.mercadolivre.com.br/MLB-1352321521-camisola-feminina-sexy-_JM")).toEqual({ kind: "item", id: "MLB1352321521" });
    expect(parseMlUrl("https://www.mercadolivre.com.br/MLB1352321521")).toEqual({ kind: "item", id: "MLB1352321521" });
  });
  it("catálogo, e o anúncio escolhido quando vem no link", () => {
    expect(parseMlUrl("https://www.mercadolivre.com.br/apple-iphone-16e/p/MLB46219443")).toEqual({ kind: "product", id: "MLB46219443" });
    expect(parseMlUrl("https://www.mercadolivre.com.br/x/p/MLB46219443?pdp_filters=item_id:MLB5123456789")).toEqual({ kind: "item", id: "MLB5123456789" });
  });
  it("produto do vendedor", () => {
    expect(parseMlUrl("https://www.mercadolivre.com.br/kit-inverno/up/MLBU761780951")).toEqual({ kind: "user_product", id: "MLBU761780951" });
  });
  it("ignora outras lojas e links sem código", () => {
    expect(parseMlUrl("https://www.amazon.com.br/dp/B0CNLVCCFX")).toBeNull();
    expect(parseMlUrl("https://www.mercadolivre.com.br/social/fulano")).toBeNull();
    expect(parseMlUrl("não é link")).toBeNull();
  });
});

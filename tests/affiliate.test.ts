import { describe, expect, it } from "vitest";
import { outboundUrl, withAffiliate } from "../lib/affiliate";

const AMZ = "https://www.amazon.com.br/dp/B0EXEMPLO1";

describe("withAffiliate", () => {
  it("coloca a tag da Amazon no link limpo", () => {
    expect(withAffiliate(AMZ, "tag=PromoValeu-20")).toBe(`${AMZ}?tag=PromoValeu-20`);
  });
  it("troca a tag que já existia e mantém os outros parâmetros", () => {
    expect(withAffiliate(`${AMZ}?tag=outro-20&th=1`, "?tag=PromoValeu-20")).toBe(`${AMZ}?tag=PromoValeu-20&th=1`);
  });
  it("modelo de rede com {url} codificado", () => {
    expect(withAffiliate(AMZ, "https://rede.exemplo/ir?id=9&to={url}")).toBe(
      `https://rede.exemplo/ir?id=9&to=${encodeURIComponent(AMZ)}`,
    );
  });
  it("modelo com {raw}", () => {
    expect(withAffiliate(AMZ, "{raw}?tag=x-20")).toBe(`${AMZ}?tag=x-20`);
  });
  it("modelo vazio, inválido ou perigoso não muda o link", () => {
    for (const t of [null, "", "   ", "qualquer coisa", "javascript:alert(1)//{url}"]) {
      expect(withAffiliate(AMZ, t)).toBe(AMZ);
    }
  });
});

describe("outboundUrl", () => {
  const tpl = "tag=PromoValeu-20";
  it("usa o nosso código em ofertas do robô e da equipe", () => {
    expect(outboundUrl({ source: "robot", urlSubmitted: AMZ }, tpl)).toBe(`${AMZ}?tag=PromoValeu-20`);
    expect(outboundUrl({ source: "admin", urlSubmitted: AMZ }, tpl)).toBe(`${AMZ}?tag=PromoValeu-20`);
  });
  it("nunca mexe no link de um usuário", () => {
    const own = `${AMZ}?tag=autor-20`;
    expect(outboundUrl({ source: "user", urlSubmitted: own }, tpl)).toBe(own);
  });
  it("oferta sem link continua sem link", () => {
    expect(outboundUrl({ source: "robot", urlSubmitted: null }, tpl)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { checkPrice, paymentCondition, priceRoseTwice, priceWithCoupon } from "../lib/price-check";

const now = new Date("2026-11-10T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000);
const hist = (...pairs: [number, number][]) => pairs.map(([d, p]) => ({ priceCents: p, at: daysAgo(d) }));

describe("checkPrice", () => {
  it("sem histórico não compara", () => {
    expect(checkPrice({ priceCents: 5000, listPriceCents: null, history: [], now }).verdict).toBe("no_comparison");
  });

  it("histórico curto não verifica, mas mostra a referência", () => {
    const r = checkPrice({ priceCents: 8000, listPriceCents: null, history: hist([2, 10000], [1, 10000]), now });
    expect(r.verdict).toBe("no_comparison");
    expect(r.referenceCents).toBe(10000);
  });

  it("desconto real de 20% com 10 dias de histórico e menor preço: verificado", () => {
    const r = checkPrice({ priceCents: 8000, listPriceCents: 12000, history: hist([10, 10000], [6, 10000], [2, 10200]), now });
    expect(r.verdict).toBe("verified");
    expect(r.realDiscountBp).toBe(2000);
    expect(r.historyDays).toBe(10);
  });

  it("desconto de 6%: bom preço", () => {
    const r = checkPrice({ priceCents: 9400, listPriceCents: null, history: hist([12, 10000], [5, 10000]), now });
    expect(r.verdict).toBe("good_price");
  });

  it("o de da loja 50% acima da referência e preço igual ao de sempre: inflado", () => {
    const r = checkPrice({ priceCents: 10000, listPriceCents: 15000, history: hist([20, 10000], [10, 10000]), now });
    expect(r.verdict).toBe("inflated");
  });

  it("histórico curto não acusa desconto inflado (oferta nova com preço anterior alto)", () => {
    const r = checkPrice({ priceCents: 9990, listPriceCents: 16650, history: hist([2, 9990], [1, 9990]), now });
    expect(r.verdict).toBe("no_comparison");
  });

  it("ignora preços com mais de 30 dias", () => {
    const r = checkPrice({ priceCents: 8000, listPriceCents: null, history: hist([60, 20000]), now });
    expect(r.verdict).toBe("no_comparison");
    expect(r.referenceCents).toBeNull();
  });
});

describe("priceRoseTwice", () => {
  it("só conta quando as duas últimas checagens passam da tolerância", () => {
    expect(priceRoseTwice(10000, [12000, 11800])).toBe(true);
    expect(priceRoseTwice(10000, [12000, 10100])).toBe(false);
    expect(priceRoseTwice(10000, [12000])).toBe(false);
  });
});
describe("checkPrice com o preço em outra loja", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  it("sem histórico: bom preço quando está 5% ou mais abaixo do mercado", () => {
    const r = checkPrice({ priceCents: 8900, listPriceCents: null, history: [], marketCents: 12900, now });
    expect(r.verdict).toBe("good_price");
    expect(r.referenceCents).toBe(12900);
  });
  it("sem histórico: desconto inflado quando o 'de' é de fachada", () => {
    expect(checkPrice({ priceCents: 10000, listPriceCents: 19900, history: [], marketCents: 9900, now }).verdict).toBe("inflated");
  });
  it("sem histórico e preço igual ao mercado: sem comparação", () => {
    expect(checkPrice({ priceCents: 9900, listPriceCents: null, history: [], marketCents: 9900, now }).verdict).toBe("no_comparison");
  });
  it("não dá 'conferido' se outra loja vende bem mais barato", () => {
    const hist = [10, 6, 2].map((d) => ({ priceCents: 10000, at: new Date(now.getTime() - d * 86400_000) }));
    expect(checkPrice({ priceCents: 8000, listPriceCents: null, history: hist, now }).verdict).toBe("verified");
    expect(checkPrice({ priceCents: 8000, listPriceCents: null, history: hist, marketCents: 6000, now }).verdict).toBe("good_price");
  });
});

describe("priceWithCoupon", () => {
  const none = { code: null, percent: null, amountCents: null };
  it("sem cupom: o preço da vitrine", () => {
    expect(priceWithCoupon(199999, none, 179900)).toEqual({ cents: 199999, known: true });
  });
  it("percentual e valor conhecidos", () => {
    expect(priceWithCoupon(200000, { code: "X", percent: 10, amountCents: null }, 180000).cents).toBe(180000);
    expect(priceWithCoupon(200000, { code: "X", percent: null, amountCents: 5000 }, 195000).cents).toBe(195000);
  });
  it("KaBuM: ZAFADINHO10 explica R$ 1.999,99 -> R$ 1.799", () => {
    expect(priceWithCoupon(199999, { code: "ZAFADINHO10", percent: null, amountCents: null }, 179900)).toEqual({ cents: 179999, known: true });
  });
  it("número do código que não fecha a conta: desconhecido", () => {
    expect(priceWithCoupon(199999, { code: "BLACK10", percent: null, amountCents: null }, 150000).known).toBe(false);
    expect(priceWithCoupon(199999, { code: "PROMOVALEU", percent: null, amountCents: null }, 179900).known).toBe(false);
  });
});

describe("paymentCondition", () => {
  it("reconhece Pix, à vista e app", () => {
    expect(paymentCondition("Preço no Pix.")).toBe(true);
    expect(paymentCondition("Preço à vista.")).toBe(true);
    expect(paymentCondition("Preço válido no aplicativo da loja.")).toBe(true);
    expect(paymentCondition("Frete grátis informado na publicação.")).toBe(false);
    expect(paymentCondition(null)).toBe(false);
  });
});

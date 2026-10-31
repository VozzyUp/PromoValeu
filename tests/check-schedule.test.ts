import { describe, expect, it } from "vitest";
import { aiPricePrompt, checkBadge, nextCheckDelayMs, parseAiPrice, priceContext } from "../lib/check-schedule";

const MIN = 60_000;

describe("nextCheckDelayMs", () => {
  it("confere mais vezes a oferta nova: 45 min, 2 h e depois 6 h", () => {
    expect(nextCheckDelayMs(15 * MIN)).toBe(45 * MIN);
    expect(nextCheckDelayMs(70 * MIN)).toBe(120 * MIN);
    expect(nextCheckDelayMs(5 * 60 * MIN)).toBe(360 * MIN);
  });
});

describe("checkBadge", () => {
  const now = Date.parse("2026-10-31T15:00:00Z");
  it("conferida: diz quando e que o preço bate", () => {
    const b = checkBadge("active", "2026-10-31T14:52:00Z", now);
    expect(b.tone).toBe("ok");
    expect(b.text).toContain("8 minutos");
    expect(b.text).toContain("bate com o anunciado");
  });
  it("preço subiu e loja que não deixa conferir não viram selo verde", () => {
    expect(checkBadge("price_up", "2026-10-31T14:00:00Z", now).tone).toBe("warn");
    expect(checkBadge("unverifiable", "2026-10-31T14:00:00Z", now).text).toContain("Confira na loja");
  });
  it("sem conferência ainda: avisa que está conferindo", () => {
    expect(checkBadge(null, null, now).text).toContain("conferindo");
  });
  it("nunca promete garantia", () => {
    for (const s of ["active", "price_up", "unverifiable", null] as const) {
      expect(checkBadge(s, "2026-10-31T14:00:00Z", now).text.toLowerCase()).not.toContain("garant");
    }
  });
});

describe("priceContext", () => {
  it("pega os trechos com R$ e ignora scripts", () => {
    const html = "<title>Air fryer 5 L</title><script>var p='R$ 1,00'</script><div>Por <b>R$ 329,90</b> no Pix</div>";
    const t = priceContext(html);
    expect(t).toContain("Air fryer 5 L");
    expect(t).toContain("R$ 329,90");
    expect(t).not.toContain("R$ 1,00");
  });
  it("página sem preço nenhum: vazio (não gasta IA)", () => {
    expect(priceContext("<title>Acesso negado</title><p>Verifique que você é humano</p>")).toBe("");
  });
});

describe("parseAiPrice", () => {
  it("lê o preço e o Pix", () => {
    expect(parseAiPrice('{"price": 349.9, "pix_price": 329.9}', 32990)).toEqual({ cents: 34990, pixCents: 32990 });
  });
  it("aceita JSON no meio do texto", () => {
    expect(parseAiPrice('Claro: {"price": 100, "pix_price": null}', 9000)?.cents).toBe(10000);
  });
  it("recusa preço longe do anunciado (parcela, outro produto) e resposta quebrada", () => {
    expect(parseAiPrice('{"price": 29.9}', 32990)).toBeNull();
    expect(parseAiPrice('{"price": 5000}', 32990)).toBeNull();
    expect(parseAiPrice("não sei", 32990)).toBeNull();
    expect(parseAiPrice('{"price": null}', 32990)).toBeNull();
  });
  it("Pix maior que o preço é ignorado", () => {
    expect(parseAiPrice('{"price": 300, "pix_price": 320}', 30000)).toEqual({ cents: 30000, pixCents: null });
  });
});

describe("aiPricePrompt", () => {
  it("leva o nome do produto e os trechos", () => {
    const p = aiPricePrompt("Fone Bluetooth", "R$ 99,90");
    expect(p.user).toContain("Fone Bluetooth");
    expect(p.user).toContain("R$ 99,90");
    expect(p.system).toContain("JSON");
  });
});

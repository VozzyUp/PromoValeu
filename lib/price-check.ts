// Verificação de preço: compara o preço da oferta com o histórico que registramos do mesmo anúncio.
// Sem scraping de outras lojas: o selo só afirma o que o nosso histórico prova.
import type { Verdict } from "./types";

export type PricePoint = { priceCents: number; at: Date };

export type PriceCheck = {
  verdict: Exclude<Verdict, "pending">;
  referenceCents: number | null;
  realDiscountBp: number | null;
  historyDays: number;
  min30Cents: number | null;
  medianCents: number | null;
};

const DAY = 86400_000;
export const MIN_HISTORY_DAYS = 7;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * history: preços anteriores do mesmo anúncio (sem o preço que está sendo avaliado).
 * - referência = mediana dos últimos 30 dias
 * - verified: desconto real >= 10%, histórico >= 7 dias e preço no menor valor dos 30 dias
 * - good_price: desconto real >= 5%
 * - inflated: com pelo menos 7 dias de histórico, o "de" da loja é >= 20% acima da referência e o desconto real fica abaixo de 5%
 * - no_comparison: histórico curto ou sem diferença
 * marketCents (mesmo produto em outra loja) permite "good_price" e "inflated" sem esperar o histórico.
 */
export function checkPrice(o: { priceCents: number; listPriceCents: number | null; history: PricePoint[]; marketCents?: number | null; now?: Date }): PriceCheck {
  const now = (o.now ?? new Date()).getTime();
  const recent = o.history.filter((p) => now - p.at.getTime() <= 30 * DAY && p.priceCents > 0);
  const historyDays = recent.length ? Math.floor((now - Math.min(...recent.map((p) => p.at.getTime()))) / DAY) : 0;
  const market = o.marketCents && o.marketCents > 0 && o.priceCents > 0 ? o.marketCents : null;

  // Comparação com o mesmo produto em outra loja (Mercado Livre): vale desde o primeiro dia.
  const byMarket = (): PriceCheck | null => {
    if (!market) return null;
    const bp = Math.round(((market - o.priceCents) / market) * 10000);
    const base = { referenceCents: market, realDiscountBp: bp > 0 ? bp : null, historyDays, min30Cents: null, medianCents: null };
    // "De" bem acima do que o produto custa em outra loja, e o "por" nem é mais barato que lá: desconto de fachada.
    if (o.listPriceCents && o.listPriceCents >= market * 1.2 && o.priceCents >= market * 0.98) return { verdict: "inflated", ...base };
    if (bp >= 500) return { verdict: "good_price", ...base };
    return null;
  };

  const none = { referenceCents: null, realDiscountBp: null, historyDays, min30Cents: null, medianCents: null };
  if (recent.length === 0 || o.priceCents <= 0) return byMarket() ?? { verdict: "no_comparison", ...none };

  const prices = recent.map((p) => p.priceCents);
  const med = median(prices);
  const min30 = Math.min(...prices);
  const realBp = Math.round(((med - o.priceCents) / med) * 10000);
  const base = { referenceCents: med, realDiscountBp: realBp > 0 ? realBp : null, historyDays, min30Cents: min30, medianCents: med };

  // Sem histórico suficiente não dá para acusar ninguém pelo histórico: só a comparação com outra loja.
  if (historyDays < MIN_HISTORY_DAYS) return byMarket() ?? { verdict: "no_comparison", ...base };
  if (o.listPriceCents && o.listPriceCents >= med * 1.2 && realBp < 500) return { verdict: "inflated", ...base };
  // "Conferido" exige também não estar mais caro que em outra loja.
  if (realBp >= 1000 && o.priceCents <= min30 * 1.01 && (!market || o.priceCents <= market * 1.05)) return { verdict: "verified", ...base };
  if (realBp >= 500) return { verdict: "good_price", ...base };
  return byMarket() ?? { verdict: "no_comparison", ...base };
}

/** O preço da página subiu o bastante, duas vezes seguidas, para dizer que a oferta acabou? */
export function priceRoseTwice(postedCents: number, lastTwoCheckedCents: number[], tolerance = 0.15): boolean {
  if (lastTwoCheckedCents.length < 2) return false;
  return lastTwoCheckedCents.slice(0, 2).every((c) => c > postedCents * (1 + tolerance));
}
export type DealCoupon = { code: string | null; percent: number | null; amountCents: number | null };

/**
 * Preço da vitrine com o cupom da oferta aplicado.
 * - percentual ou valor conhecido: aplica.
 * - só o código: tenta o número no fim do código (ZAFADINHO10 = 10%) e só aceita se a conta bater com o preço da oferta (2%).
 * known=false quando não deu para saber quanto o cupom desconta.
 */
export function priceWithCoupon(pageCents: number, coupon: DealCoupon, dealCents: number): { cents: number; known: boolean } {
  if (!coupon.code && coupon.percent == null && coupon.amountCents == null) return { cents: pageCents, known: true };
  if (coupon.percent != null && coupon.percent > 0 && coupon.percent < 100) return { cents: Math.round(pageCents * (1 - coupon.percent / 100)), known: true };
  if (coupon.amountCents != null && coupon.amountCents > 0) return { cents: Math.max(0, pageCents - coupon.amountCents), known: true };
  const digits = /(\d{1,2})$/.exec(coupon.code ?? "");
  if (digits) {
    const pct = Number(digits[1]);
    if (pct >= 5 && pct <= 70) {
      const cents = Math.round(pageCents * (1 - pct / 100));
      if (Math.abs(cents - dealCents) <= dealCents * 0.02) return { cents, known: true };
    }
  }
  return { cents: pageCents, known: false };
}

/** Preço da oferta depende de forma de pagamento (Pix, à vista, só no app)? A API e a página da loja mostram o preço normal. */
export function paymentCondition(description: string | null | undefined): boolean {
  return /\bpix\b|[àa] vista|no aplicativo|no app\b|pelo app\b/i.test(description ?? "");
}

// Regras puras da conferência das ofertas: quando conferir de novo, o que o selo diz e a leitura do preço pela IA.
import { timeAgo } from "./format";

export type CheckState = "active" | "price_up" | "unverifiable";

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Oferta nova é conferida mais vezes: ~15 min, ~1 h, ~3 h e depois a cada 6 h. */
export function nextCheckDelayMs(ageMs: number): number {
  if (ageMs < HOUR) return 45 * MIN;
  if (ageMs < 3 * HOUR) return 2 * HOUR;
  return 6 * HOUR;
}

export type Badge = { tone: "ok" | "warn" | "muted"; text: string };

/** O que a página da oferta diz sobre a última conferência. Fatos com hora, nunca "garantido". */
export function checkBadge(state: CheckState | null, lastCheckedAt: string | null, now = Date.now()): Badge {
  if (!state || !lastCheckedAt) return { tone: "muted", text: "Estamos conferindo o preço na loja. Volte em alguns minutos." };
  const when = timeAgo(lastCheckedAt, now);
  if (state === "active") return { tone: "ok", text: `Conferida ${when}: o preço na loja bate com o anunciado.` };
  if (state === "price_up") return { tone: "warn", text: `Na conferência ${when}, o preço na loja estava mais alto que o anunciado.` };
  return { tone: "muted", text: `Esta loja não deixou a gente conferir o preço (${when}). Confira na loja antes de comprar.` };
}

/** Texto visível da página, só os trechos perto de "R$" (é o que a IA precisa ler). */
export function priceContext(html: string, max = 4000): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  const parts: string[] = [];
  let used = title.length;
  for (const m of text.matchAll(/R\$/g)) {
    const i = m.index ?? 0;
    const piece = text.slice(Math.max(0, i - 120), i + 80).trim();
    if (parts.length && parts[parts.length - 1].includes(piece.slice(0, 40))) continue;
    if (used + piece.length > max) break;
    parts.push(piece);
    used += piece.length;
  }
  if (parts.length === 0) return "";
  return [title, ...parts].filter(Boolean).join("\n");
}

export function aiPricePrompt(productTitle: string, pageText: string): { system: string; user: string } {
  return {
    system:
      "Você lê trechos de uma página de produto de uma loja brasileira e responde só com JSON, sem mais nada: " +
      '{"price": número em reais do preço principal do produto, ou null, "pix_price": número em reais do preço no Pix ou à vista, se aparecer, ou null}. ' +
      "Ignore valor de parcela, frete, cashback e preços de outros produtos. Se não tiver certeza, use null.",
    user: `Produto: ${productTitle.slice(0, 200)}\n\nTrechos da página:\n${pageText}`,
  };
}

/** Preço lido pela IA. Só aceita valores perto do preço da oferta (entre 30% e 4x), para não pegar parcela ou outro produto. */
export function parseAiPrice(raw: string, dealCents: number): { cents: number; pixCents: number | null } | null {
  const json = /\{[\s\S]*\}/.exec(raw)?.[0];
  if (!json) return null;
  let o: { price?: unknown; pix_price?: unknown };
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  const toCents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null);
  const sane = (c: number | null) => (c != null && c >= dealCents * 0.3 && c <= dealCents * 4 ? c : null);
  const cents = sane(toCents(o.price));
  if (cents == null) return null;
  const pix = sane(toCents(o.pix_price));
  return { cents, pixCents: pix != null && pix <= cents ? pix : null };
}

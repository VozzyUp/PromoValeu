// Lê o texto de uma publicação de ofertas: título do produto, preço, preço antigo, cupom e observações.
// Função pura: os canais escrevem de jeitos diferentes, então tudo aqui é heurística com testes.
import type { RawPost } from "./types";

export type CouponInfo = {
  code: string | null;
  kind: "amount" | "percent" | "free_shipping" | "other";
  amountCents: number | null;
  percent: number | null;
  minOrderCents: number | null;
  text: string | null; // a frase do desconto, como "R$ 20 OFF acima de R$ 99"
};

export type ParsedPost = {
  title: string | null;
  titleScore: number;
  priceCents: number | null;
  listPriceCents: number | null;
  coupon: CouponInfo | null;
  links: string[];
  facts: string[];
};

const MONEY = /R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g;

export function moneyToCents(raw: string): number | null {
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) : null;
}

/** Tira emoji, símbolos de enfeite e marcadores do começo; junta os espaços. */
export function cleanLine(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu, " ")
    .replace(/[▪▫◾◽■□●○•◆◇►▶➡➜✔✅☑✓✗✘✦✧★☆|]+/g, " ")
    .replace(/^[\s\-–—*:>~_]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NOISE = /\b(oferta|ofertas|promo[çc][aã]o|promo|exclusiv\w*|aten[çc][aã]o|corr[ae]|aproveit\w*|imperd[ií]ve\w*|baixou|menor pre[çc]o|hist[oó]ric\w*|rel[aâ]mpago|frete|link|compre|clique|seja prime|membros|grupo|canal|estoque|acabando|urgente|desconto|achadinh\w*|off|resgate|vai sair|novo cupom|cupom|app|coment[aá]rios?|d[uú]vidas?|deixe|siga|participe|entre no|chame|avalia[çc][aã]o)\b/i;
const SPEC = /\b\d+(?:[.,]\d+)?\s?(gb|tb|mb|kg|g|mg|ml|l|w|mah|hz|pol|polegadas|cm|mm|m|v|un|unidades|pe[çc]as)\b|\b\d{2,3}["”]|\b[A-Z]{1,6}-?\d{2,}[A-Z0-9-]*\b|\b(4k|8k|full ?hd|ssd|bivolt|wi-?fi|bluetooth|usb|led|oled)\b/i;

/**
 * Frase "gritada" (toda em maiúsculas). Conta só palavras de 4+ letras sem números: siglas (TV, LG, UHD)
 * e códigos de modelo (55UN85CBPSA) são normais no nome do produto e não contam como grito.
 */
function isShouting(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => !/\d/.test(w)).map((w) => w.replace(/[^\p{L}]/gu, "")).filter((w) => w.length >= 4);
  if (words.length < 2) return false;
  return words.filter((w) => w === w.toUpperCase()).length / words.length > 0.8;
}

const HOOK_START = /^(possui|ideal|perfeit\w*|garant\w*|chegou|olha|imagina|quem|para quem|sabe|voc[eê]|seu|sua|deixe|n[aã]o perca|[uú]ltimas?|s[oó] hoje|hoje)\b/i;
/** Linha que só diz onde comprar ("Loja Oficial X na Amazon:", "Vendido por ..."). */
const WHERE = /\b(loja oficial|lojas oficiais|vendido (por|pela|pelo)|dispon[ií]vel (na|no|em)|compre (na|no|aqui))\b/i;

/** Nota de cada linha: o nome do produto costuma ser longo, ter marca/modelo/medida e não terminar em "!". */
function scoreLine(line: string, raw: string, bold: string[]): number {
  let score = 0;
  const allCaps = isShouting(line);
  if (allCaps) score -= 3;
  if (NOISE.test(line)) score -= 3;
  if (WHERE.test(line)) score -= 3;
  if (/[:：]\s*$/u.test(raw.trim())) score -= 3; // rótulo do link que vem embaixo
  if (/[!‼❗❕?]️?\s*$/u.test(raw.trim())) score -= 2; // frase de chamada
  if (HOOK_START.test(line)) score -= 2;
  if (!allCaps && bold.some((b) => b === line || (b.length >= 10 && line.includes(b)))) score += 1;
  if (SPEC.test(line)) score += 2;
  if (line.split(" ").length >= 4) score += 1;
  if (line.length >= 30) score += 1;
  if (line.length >= 50) score += 1;
  return score;
}

function pickTitle(lines: string[], bold: string[]): { title: string | null; score: number } {
  let best: { title: string | null; score: number } = { title: null, score: -99 };
  for (const raw of lines) {
    if (/https?:\/\/|t\.me\//i.test(raw)) continue;
    // "Caixa de Som X por R$ 89": aproveita o que vem antes do preço, com um ponto a menos.
    const hasPrice = /R\$/.test(raw);
    const text = hasPrice ? raw.slice(0, raw.search(/R\$/)).replace(/\s*(\b(por|de|apenas|só|so|sai|a partir)\b|[:\-–|])\s*$/i, "") : raw;
    const line = cleanLine(text).replace(/[!?.:]+$/, "");
    if (line.length < 10) continue;
    const score = scoreLine(line, text, bold) - (hasPrice ? 1 : 0);
    if (score > best.score) best = { title: line.slice(0, 140), score };
  }
  return best;
}

type Amount = { cents: number; line: string; before: string; after: string };

function amounts(lines: string[]): Amount[] {
  const out: Amount[] = [];
  for (const line of lines) {
    for (const m of line.matchAll(MONEY)) {
      const cents = moneyToCents(m[1]);
      if (cents == null) continue;
      const at = m.index ?? 0;
      out.push({ cents, line, before: line.slice(Math.max(0, at - 24), at), after: line.slice(at + m[0].length, at + m[0].length + 16) });
    }
  }
  return out;
}

const isInstallment = (a: Amount) => /\d+\s*x\s*(de\s*)?$/i.test(a.before) || /^\s*(\/\s*m[eê]s|mensa)/i.test(a.after);
const isCouponPart = (a: Amount) =>
  /^\s*off\b/i.test(a.after) || /(acima de|a partir de|limitado a|m[ií]nimo de|at[eé]|cupo[mn]\s*(de)?|desconto\s*(de)?|economi[az]e?\s*(de)?)\s*$/i.test(a.before);
const isShipping = (a: Amount) => /frete[^R]*$/i.test(a.before);
const isOld = (a: Amount, struck: (number | null)[]) =>
  /\b(de|era|antes|pre[çc]o antigo)\s*:?\s*$/i.test(a.before) || struck.includes(a.cents) || /^\s*(por\b|➡|=>|->)/i.test(a.after);
const isNow = (a: Amount) => /\b(por|agora|sai por|pre[çc]o)\s*:?\s*$/i.test(a.before);

function readCoupon(lines: string[], text: string): CouponInfo | null {
  let code: string | null = null;
  for (const line of lines) {
    const at = line.search(/cupo[mn]/i);
    if (at < 0) continue;
    const rest = line.slice(at).replace(/^cupo[mn]s?\s*(de\s+desconto)?\s*/i, "");
    const m = /^[:：\-–]?\s*["'“”«]?([A-Z0-9][A-Z0-9_-]{3,29})(?![\p{Ll}])/u.exec(rest);
    if (m && /[A-Z]/.test(m[1]) && !STOP_CODES.has(m[1])) {
      code = m[1];
      break;
    }
  }
  const offLine = lines.find((l) => /\boff\b/i.test(l) && /(\d+\s*%|R\$)/.test(l)) ?? null;
  const freeShipping = /cupo[mn][^\n]{0,40}frete gr[aá]tis|frete gr[aá]tis[^\n]{0,40}cupo[mn]/i.test(text);
  if (!code && !offLine && !freeShipping) return null;
  const pct = offLine ? /(\d{1,2})\s*%\s*off/i.exec(offLine) : null;
  const amt = offLine ? /R\$\s*([\d.,]+)\s*off/i.exec(offLine) : null;
  const min = offLine ? /(?:acima de|a partir de|m[ií]nimo de)\s*R\$\s*([\d.,]+)/i.exec(offLine) : null;
  return {
    code,
    kind: pct ? "percent" : amt ? "amount" : freeShipping ? "free_shipping" : "other",
    percent: pct ? Number(pct[1]) : null,
    amountCents: amt ? moneyToCents(amt[1]) : null,
    minOrderCents: min ? moneyToCents(min[1]) : null,
    text: offLine ? cleanLine(offLine).slice(0, 140) : null,
  };
}

const STOP_CODES = new Set(["OFF", "APP", "FRETE", "GRATIS", "GRÁTIS", "NOVO", "SHOPEE", "AMAZON", "MERCADO", "LIVRE", "MAGALU", "KABUM", "PIX", "LINK", "AQUI", "HOJE", "VALIDO", "VÁLIDO"]);

function facts(text: string): string[] {
  const out: string[] = [];
  if (/\bprime\b/i.test(text) && /exclusiv|membros|assinantes/i.test(text)) out.push("Exclusivo para membros Prime.");
  if (/\bvia pix\b|\bno pix\b|\bpix\b/i.test(text)) out.push("Preço no Pix.");
  else if (/[àa] vista/i.test(text)) out.push("Preço à vista.");
  if (/parcelad/i.test(text)) out.push("Preço parcelado.");
  if (/frete gr[aá]tis/i.test(text)) out.push("Frete grátis informado na publicação.");
  if (/\bno app\b|\bpelo app\b|\bapp\s*-/i.test(text)) out.push("Preço válido no aplicativo da loja.");
  return out;
}

export function parsePost(p: RawPost): ParsedPost {
  const lines = p.text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const all = amounts(lines);
  const usable = all.filter((a) => !isInstallment(a) && !isCouponPart(a) && !isShipping(a));
  const struck = p.strike.map((x) => {
    const m = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/.exec(x);
    return m ? moneyToCents(m[1]) : null;
  });
  const old = usable.filter((a) => isOld(a, struck));
  const current = usable.filter((a) => !old.includes(a));
  const now = current.find(isNow) ?? (current.length ? current.reduce((m, a) => (a.cents < m.cents ? a : m)) : null);
  const priceCents = now?.cents ?? null;
  const listMax = old.length ? Math.max(...old.map((a) => a.cents)) : null;
  const listPriceCents = priceCents != null && listMax != null && listMax > priceCents ? listMax : null;
  const t = pickTitle(lines, p.bold.map(cleanLine));
  const links = p.links.filter((l) => !/^https?:\/\/(www\.)?(t\.me|telegram\.me|telegram\.org)\//i.test(l));
  return { title: t.title, titleScore: t.score, priceCents, listPriceCents, coupon: readCoupon(lines, p.text), links, facts: facts(p.text) };
}

/** Título da página da loja sem o nome da loja grudado ("... | Amazon.com.br", "Amazon.com.br: ..."). */
export function cleanPageTitle(t: string | null | undefined): string | null {
  if (!t) return null;
  // "Amazon.com.br: Produto: Departamento" — o departamento no fim também sai.
  const amazon = /^amazon\.com\.br\s*:\s*/i.test(t);
  const s = cleanLine(
    (amazon ? t.replace(/^amazon\.com\.br\s*:\s*/i, "").replace(/\s*:\s*[^:]{2,40}$/, "") : t)
      .replace(/\s*[|\-–:]\s*(amazon\.com\.br|amazon|mercado ?livre|mercadolivre|kabum!?|magazine luiza|magalu|casas bahia|shopee brasil|shopee|aliexpress)\b.*$/i, ""),
  );
  // Página genérica (só o nome da loja) não serve de título.
  if (/^(amazon(\.com\.br)?|mercado ?livre|kabum!?|magazine luiza|magalu|casas bahia|shopee( brasil)?|aliexpress)$/i.test(s)) return null;
  return s.length >= 10 ? s.slice(0, 140) : null;
}

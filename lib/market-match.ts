// O produto achado em outra loja é o mesmo da oferta? Só aceita com prova forte: mesmo código de barras,
// ou mesmo código de modelo no nome e sem conflito de capacidade/voltagem. Testado em tests/market-match.test.ts.
import { normalizeTitle } from "./categorize";

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "com", "para", "em", "sem", "a", "o", "na", "no", "por", "kit", "un", "und", "cor", "preto", "branco", "novo", "original"]);
const UNIT = /^\d+([.,]\d+)?(gb|tb|mb|ml|l|kg|g|mg|w|v|mah|hz|pol|cm|mm|m|k|un|pcs|pecas|litros?)$/;

const tokens = (s: string) => normalizeTitle(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Códigos de modelo: letras e números juntos (GS520, PLR14B, 55UR8750PSA), sem medidas (128gb, 220v). */
export function modelCodes(title: string): Set<string> {
  return new Set(tokens(title).filter((t) => t.length >= 4 && /\d/.test(t) && /[a-z]/.test(t) && !UNIT.test(t)));
}

/** Medidas que mudam o produto: capacidade, voltagem, tamanho de tela. */
function specs(title: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tokens(title)) {
    const m = /^(\d+(?:[.,]\d+)?)(gb|tb|v|pol|mah|ml|l|kg)$/.exec(t);
    if (m) out.set(m[2] === "tb" ? "gb" : m[2], m[2] === "tb" ? String(Number(m[1]) * 1024) : m[1]);
  }
  return out;
}

const words = (s: string) => new Set(tokens(s).filter((t) => t.length >= 3 && !STOP.has(t) && !UNIT.test(t)));

/** Confiança de 0 a 1 de que é o mesmo produto. Abaixo de 0.7, não compare. */
export function matchConfidence(a: { title: string; gtin?: string | null }, b: { title: string; gtin?: string | null }): number {
  if (a.gtin && b.gtin) return a.gtin.replace(/^0+/, "") === b.gtin.replace(/^0+/, "") ? 1 : 0;
  const sa = specs(a.title), sb = specs(b.title);
  for (const [k, v] of sa) if (sb.has(k) && sb.get(k) !== v) return 0; // 128 GB x 256 GB, 110 V x 220 V
  const ma = modelCodes(a.title), mb = modelCodes(b.title);
  const sharedModel = [...ma].some((m) => mb.has(m));
  if (!sharedModel) return 0;
  const wa = words(a.title), wb = words(b.title);
  const inter = [...wa].filter((x) => wb.has(x)).length;
  const jaccard = inter / Math.max(1, new Set([...wa, ...wb]).size);
  // O modelo bate; exige mais uma palavra em comum (normalmente a marca) para não confundir códigos curtos.
  return inter >= 2 ? Math.min(0.95, 0.7 + jaccard / 2) : 0;
}

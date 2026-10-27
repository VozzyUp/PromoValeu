// Nosso código de afiliado, aplicado na hora do clique. Só em ofertas da equipe e do robô:
// o link de quem publicou nunca é alterado (decisão do dono).
import type { Deal } from "./types";

/**
 * Monta o link com o modelo da loja. Três formatos:
 * - "tag=meuid-20" (ou "?tag=...&x=y"): coloca esses parâmetros no endereço, trocando os que já existirem;
 * - "https://rede/ir?to={url}": o endereço entra codificado no lugar de {url};
 * - "{raw}?x=1": o endereço entra como está no lugar de {raw}.
 * Modelo vazio ou inválido devolve o endereço sem mudança.
 */
export function withAffiliate(url: string, template: string | null | undefined): string {
  const t = (template ?? "").trim();
  if (!t) return url;
  let out: string;
  if (t.includes("{url}") || t.includes("{raw}")) {
    out = t.replaceAll("{url}", encodeURIComponent(url)).replaceAll("{raw}", url);
  } else if (/^[?&]?[\w.-]+=/.test(t)) {
    const u = new URL(url);
    for (const [k, v] of new URLSearchParams(t.replace(/^[?&]/, ""))) u.searchParams.set(k, v);
    out = u.toString();
  } else {
    return url;
  }
  try {
    const u = new URL(out);
    return u.protocol === "https:" || u.protocol === "http:" ? out : url;
  } catch {
    return url;
  }
}

/** Link final do clique: o nosso só quando a oferta é da equipe ou do robô. */
export function outboundUrl(deal: Pick<Deal, "source" | "urlSubmitted">, template: string | null | undefined): string | null {
  if (!deal.urlSubmitted) return null;
  if (deal.source !== "robot" && deal.source !== "admin") return deal.urlSubmitted;
  try {
    return withAffiliate(deal.urlSubmitted, template);
  } catch {
    return deal.urlSubmitted;
  }
}

/** Confere o modelo digitado no painel. Devolve a mensagem de erro, ou null se estiver certo. */
export function affiliateTemplateError(template: string): string | null {
  const t = template.trim();
  if (!t) return null;
  if (/\s/.test(t)) return "O código de afiliado não pode ter espaços.";
  if (/^[?&]?[\w.-]+=/.test(t) && !t.includes("{")) return null; // parâmetros, ex.: tag=meuid-20
  if (/^https:\/\//.test(t) && t.includes("{url}")) return null; // link de rede
  if (t.startsWith("{raw}")) return null;
  return "Use parâmetros (ex.: tag=SEU_ID-20) ou um link https:// com {url}.";
}

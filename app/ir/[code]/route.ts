import { NextResponse } from "next/server";
import { getDealByCode, recordClick } from "@/lib/data";
import { isLikelyBot, visitorHash } from "@/lib/auth";
import { redirectToPath } from "@/lib/redirect";
import { outboundUrl } from "@/lib/affiliate";
import { getStoreAffiliateTemplate } from "@/lib/data/supabase";
import { supabaseEnabled } from "@/lib/supabase/server";

const CHANNELS = new Set(["site", "telegram", "whatsapp", "instagram", "other"]);

// Modelo de afiliado por loja, guardado 1 minuto (no pico cada clique faria a mesma consulta).
const templates = new Map<string, { value: string | null; expires: number }>();
async function storeTemplate(storeId: string): Promise<string | null> {
  if (!supabaseEnabled()) return null;
  const hit = templates.get(storeId);
  if (hit && hit.expires > Date.now()) return hit.value;
  try {
    const value = await getStoreAffiliateTemplate(storeId);
    templates.set(storeId, { value, expires: Date.now() + 60_000 });
    return value;
  } catch {
    return null; // sem o modelo, o clique segue para o link original
  }
}

/** Registra o clique (1 por visitante/oferta/dia, sem bots) e manda para a loja. Link de usuário vai sem alteração; oferta da equipe ou do robô leva o nosso código de afiliado. */
export async function GET(request: Request, ctx: RouteContext<"/ir/[code]">) {
  const { code } = await ctx.params;
  const deal = await getDealByCode(code);
  if (!deal || (deal.status !== "published" && deal.status !== "expired")) {
    return redirectToPath("/", 302);
  }
  if (deal.status === "expired") {
    return redirectToPath(`/oferta/${deal.slug}`, 302);
  }
  const c = new URL(request.url).searchParams.get("c") ?? "site";
  if (!(await isLikelyBot())) {
    await recordClick(deal.id, await visitorHash(), CHANNELS.has(c) ? c : "other");
  }
  // Oferta sem link (ex.: promoção só em loja física): fica na página da oferta.
  if (!deal.urlSubmitted) return redirectToPath(`/oferta/${deal.slug}`, 302);
  const tpl = deal.source === "user" ? null : await storeTemplate(deal.storeId);
  const res = NextResponse.redirect(outboundUrl(deal, tpl) ?? deal.urlSubmitted, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

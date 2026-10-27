// Robô de captação da Shopee: busca ofertas pela API de afiliados, filtra pelas regras e cria as ofertas (fila ou publicadas).
import "server-only";
import { checkImage } from "../image-check";
import { createDeal, createStoreForHost, listStores } from "../data";
import { autoCategoryId } from "../data/auto-category";
import { getIntegrationConfig } from "../data/integrations";
import { notifyPublished, saveDealImages } from "../data/publish";
import { trackNewDeal } from "../data/verification";
import { fetchImageBytes } from "../link-preview";
import { findStoreForHost } from "../links";
import { searchOffers, shortLink, type ShopeeOffer } from "../integrations/shopee";
import { db } from "../supabase/db";
import { passesRule, shopeeUrlKey } from "./rules";

const REPOST_DAYS = 14;

export type RobotRule = {
  id: string; name: string; keywords: string[]; category_id: string | null; min_discount_bp: number; min_commission_bp: number;
  max_price_cents: number | null; per_run: number; auto_publish: boolean;
};

export type RobotStats = { found: number; created: number; published: number; duplicates: number; filtered: number; inflated: number; errors: number };

/** Autor das ofertas criadas por robô (o perfil com papel system). */
export async function systemAuthorId(): Promise<string> {
  const { data, error } = await db().from("profiles").select("id").eq("role", "system").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Falta o usuário do sistema (perfil com papel system).");
  return (data as { id: string }).id;
}

export async function runShopeeRule(ruleId: string): Promise<RobotStats> {
  const cfg = await getIntegrationConfig<{ appId: string; secret: string }>("shopee");
  if (!cfg) throw new Error("A integração da Shopee está desligada ou incompleta.");
  const { data, error } = await db().from("robot_rules").select("*").eq("id", ruleId).maybeSingle();
  if (error) throw error;
  const rule = data as (RobotRule & { source: string; active: boolean }) | null;
  if (!rule || rule.source !== "shopee") throw new Error("Regra não encontrada ou de outra fonte.");

  const stats: RobotStats = { found: 0, created: 0, published: 0, duplicates: 0, filtered: 0, inflated: 0, errors: 0 };
  const authorId = await systemAuthorId();
  let store = findStoreForHost("shopee.com.br", await listStores());
  store ??= await createStoreForHost("shopee.com.br");

  const keywords = rule.keywords.length ? rule.keywords.slice(0, 6) : [""];
  const seen = new Set<string>();
  const candidates: ShopeeOffer[] = [];
  for (const keyword of keywords) {
    const offers = await searchOffers(cfg, { keyword, limit: 40, sortType: 2 });
    for (const o of offers) {
      if (seen.has(o.itemId)) continue;
      seen.add(o.itemId);
      stats.found++;
      if (passesRule(o, rule)) candidates.push(o);
      else stats.filtered++;
    }
  }
  candidates.sort((a, b) => b.discountPct - a.discountPct || b.sales - a.sales);

  const since = new Date(Date.now() - REPOST_DAYS * 86400_000).toISOString();
  for (const o of candidates) {
    if (stats.created >= rule.per_run) break;
    try {
      const key = shopeeUrlKey(o.itemId);
      const dup = await db().from("deals").select("id").eq("url_key", key).gte("created_at", since).limit(1);
      if (dup.data && dup.data.length > 0) {
        stats.duplicates++;
        continue;
      }
      const title = o.title.length > 140 ? `${o.title.slice(0, 137)}...` : o.title;
      const listPrice = o.discountPct > 0 && o.discountPct < 95 ? Math.round((o.priceCents * 100) / (100 - o.discountPct)) : null;
      const deal = await createDeal({
        authorId, title, storeId: store.id, categoryId: rule.category_id ?? (await autoCategoryId(title)), urlSubmitted: o.offerLink, urlKey: key,
        description: `${o.shopName ? `Vendido por ${o.shopName}. ` : ""}${o.sales} vendidos${o.rating ? `, nota ${o.rating.toFixed(1)}` : ""}.`,
        priceCents: o.priceCents, listPriceCents: listPrice, couponCode: null,
        publish: rule.auto_publish, source: "robot",
      });
      stats.created++;

      // O link sai com o código da oferta no subId: é assim que a venda volta casada com o clique.
      const link = await shortLink(cfg, o.productLink, deal.code);
      if (link) await db().from("deals").update({ url_submitted: link, url_owner_affiliate: link }).eq("id", deal.id);

      if (o.imageUrl) {
        const bytes = await fetchImageBytes(o.imageUrl, 3 * 1024 * 1024);
        if (bytes && !checkImage(bytes)) await saveDealImages(deal.id, [bytes]);
      }
      await trackNewDeal({ dealId: deal.id, storeId: store.id, urlKey: key, url: o.productLink, priceCents: o.priceCents, source: "robot", externalId: o.itemId });

      const v = await db().from("deals").select("verdict").eq("id", deal.id).single();
      if ((v.data as { verdict: string } | null)?.verdict === "inflated") {
        await db().from("deals").update({ status: "rejected", reject_reason: "Desconto inflado (robô)" }).eq("id", deal.id);
        stats.inflated++;
      } else if (deal.status === "published") {
        stats.published++;
        await notifyPublished(deal.id);
      }
    } catch (e) {
      stats.errors++;
      console.error("[robot shopee]", o.itemId, e);
    }
  }
  await db().from("robot_rules").update({ last_run_at: new Date().toISOString() }).eq("id", ruleId);
  return stats;
}
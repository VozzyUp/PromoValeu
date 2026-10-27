// Preço do mesmo produto no Mercado Livre, para o selo (não aparece para o visitante).
// Só compara quando há prova forte de que é o mesmo produto (lib/market-match.ts).
import "server-only";
import { mlQuote, mlSearchCatalog } from "../integrations/mercadolivre";
import { findStoreForHost } from "../links";
import { matchConfidence } from "../market-match";
import { parseMlUrl } from "../ml-url";
import { db } from "../supabase/db";
import { urlKey } from "../url-key";
import { listStores } from "./index";
import { mlAccessToken } from "./integrations";

const MIN_CONFIDENCE = 0.7;
const FRESH_MS = 6 * 3600_000;

type DealRow = {
  id: string; title: string; url_submitted: string | null; listing_id: string | null;
  listing: { id: string; product_id: string | null; product: { ean: string | null } | null } | null;
};

async function productFor(listingId: string, current: string | null, ean: string | null, title: string): Promise<string> {
  if (current) return current;
  if (ean) {
    const found = await db().from("products").select("id").eq("ean", ean).maybeSingle();
    const id = (found.data as { id: string } | null)?.id;
    if (id) {
      await db().from("listings").update({ product_id: id }).eq("id", listingId);
      return id;
    }
  }
  const ins = await db().from("products").insert({ ean, normalized_title: title.toLowerCase().slice(0, 200) }).select("id").single();
  if (ins.error) throw ins.error;
  const id = (ins.data as { id: string }).id;
  await db().from("listings").update({ product_id: id }).eq("id", listingId);
  return id;
}

/**
 * Procura a oferta no catálogo do Mercado Livre (código de barras primeiro, depois o nome), guarda o preço de lá
 * como outro anúncio do mesmo produto e devolve true se guardou. Ofertas do próprio Mercado Livre não passam por aqui.
 */
export async function refreshMarketPrice(dealId: string): Promise<boolean> {
  const { data, error } = await db().from("deals")
    .select("id, title, url_submitted, listing_id, listing:listings!deals_listing_id_fkey(id, product_id, product:products(ean))")
    .eq("id", dealId).maybeSingle();
  if (error) throw error;
  const d = data as unknown as DealRow | null;
  if (!d?.listing || !d.url_submitted || parseMlUrl(d.url_submitted)) return false;
  const token = await mlAccessToken();
  if (!token) return false;
  const ml = findStoreForHost("mercadolivre.com.br", await listStores());
  if (!ml) return false;
  const ean = d.listing.product?.ean ?? null;

  // Já tem o anúncio do Mercado Livre ligado ao produto: só atualiza o preço quando estiver velho.
  let target: { listingId: string; catalogId: string } | null = null;
  if (d.listing.product_id) {
    const l = await db().from("listings").select("id, external_id, checked_at")
      .eq("product_id", d.listing.product_id).eq("store_id", ml.id).not("external_id", "is", null).limit(1).maybeSingle();
    const row = l.data as { id: string; external_id: string; checked_at: string | null } | null;
    if (row) {
      if (row.checked_at && Date.now() - new Date(row.checked_at).getTime() < FRESH_MS) return false;
      target = { listingId: row.id, catalogId: row.external_id };
    }
  }

  if (!target) {
    const hits = await mlSearchCatalog(token, ean ? { gtin: ean } : { title: d.title });
    let best: { id: string; name: string; gtin: string | null; conf: number } | null = null;
    for (const h of hits) {
      const conf = matchConfidence({ title: d.title, gtin: ean }, { title: h.name, gtin: ean ? h.gtin : null });
      if (conf >= MIN_CONFIDENCE && (!best || conf > best.conf)) best = { ...h, conf };
    }
    if (!best) return false;
    const productId = await productFor(d.listing.id, d.listing.product_id, ean ?? (best.conf === 1 ? best.gtin : null), d.title);
    const url = new URL(`https://www.mercadolivre.com.br/p/${best.id}`);
    const key = urlKey(url);
    const found = await db().from("listings").select("id").eq("store_id", ml.id).eq("canonical_url", key).maybeSingle();
    let listingId = (found.data as { id: string } | null)?.id ?? null;
    if (!listingId) {
      const ins = await db().from("listings").insert({
        store_id: ml.id, canonical_url: key, external_id: best.id, product_id: productId, match_confidence: best.conf,
      }).select("id").single();
      if (ins.error) throw ins.error;
      listingId = (ins.data as { id: string }).id;
    } else {
      await db().from("listings").update({ product_id: productId, external_id: best.id, match_confidence: best.conf }).eq("id", listingId);
    }
    target = { listingId, catalogId: best.id };
  }

  const q = await mlQuote(token, { kind: "product", id: target.catalogId });
  const now = new Date().toISOString();
  if (q.cents == null) {
    await db().from("listings").update({ in_stock: q.active, checked_at: now }).eq("id", target.listingId);
    return false;
  }
  const snap = await db().from("price_snapshots").insert({ listing_id: target.listingId, price_cents: q.cents, source: "recheck", in_stock: q.active });
  if (snap.error) throw snap.error;
  await db().from("listings").update({ last_price_cents: q.cents, in_stock: q.active, checked_at: now }).eq("id", target.listingId);
  return true;
}

/** Menor preço recente (2 dias) do mesmo produto em outras lojas, e quantas lojas entraram na conta. */
export async function marketReference(listingId: string): Promise<{ cents: number | null; stores: number }> {
  const l = await db().from("listings").select("product_id").eq("id", listingId).maybeSingle();
  const productId = (l.data as { product_id: string | null } | null)?.product_id;
  if (!productId) return { cents: null, stores: 0 };
  const since = new Date(Date.now() - 2 * 86400_000).toISOString();
  const others = await db().from("listings").select("last_price_cents, in_stock")
    .eq("product_id", productId).neq("id", listingId).gte("checked_at", since).not("last_price_cents", "is", null);
  const prices = ((others.data ?? []) as { last_price_cents: number; in_stock: boolean | null }[])
    .filter((o) => o.in_stock !== false && o.last_price_cents > 0).map((o) => o.last_price_cents);
  return { cents: prices.length ? Math.min(...prices) : null, stores: prices.length };
}

// Histórico de preço, selos de verificação e revalidação periódica das ofertas no ar. Só Supabase.
import "server-only";
import { fetchLinkInfo, fetchPreview } from "../link-preview";
import { checkPrice, priceRoseTwice, type PricePoint } from "../price-check";
import { mlPriceCents } from "../integrations/mercadolivre";
import { parseMlUrl } from "../ml-url";
import { mlAccessToken } from "./integrations";
import { db } from "../supabase/db";
import type { DealView } from "../types";
import { JOIN, toViews, type DealJoinRow } from "./supabase";

type SnapshotSource = "robot" | "recheck" | "post" | "feed";

/** Acha ou cria o anúncio da loja pela chave canônica do link. */
export async function ensureListing(storeId: string, canonicalKey: string, externalId: string | null, canonicalUrl: string): Promise<string | null> {
  const found = await db().from("listings").select("id").eq("store_id", storeId).eq("canonical_url", canonicalKey).maybeSingle();
  if (found.error) throw found.error;
  if (found.data) return (found.data as { id: string }).id;
  const ins = await db().from("listings")
    .insert({ store_id: storeId, canonical_url: canonicalKey, external_id: externalId }).select("id").single();
  if (ins.error) {
    // corrida: outro processo criou entre a busca e a gravação
    const again = await db().from("listings").select("id").eq("store_id", storeId).eq("canonical_url", canonicalKey).maybeSingle();
    return (again.data as { id: string } | null)?.id ?? null;
  }
  void canonicalUrl;
  return (ins.data as { id: string }).id;
}

export async function addSnapshot(listingId: string, priceCents: number, source: SnapshotSource) {
  const { error } = await db().from("price_snapshots").insert({ listing_id: listingId, price_cents: priceCents, source });
  if (error) throw error;
  await db().from("listings").update({ last_price_cents: priceCents, checked_at: new Date().toISOString() }).eq("id", listingId);
}

type DealForCheck = {
  id: string; price_cents: number | null; list_price_cents: number | null; listing_id: string | null; created_at: string;
};

/** Reavalia o selo da oferta com o histórico do anúncio e guarda o resultado. */
export async function verifyDeal(dealId: string): Promise<string | null> {
  const { data, error } = await db().from("deals")
    .select("id, price_cents, list_price_cents, listing_id, created_at").eq("id", dealId).maybeSingle();
  if (error) throw error;
  const d = data as DealForCheck | null;
  if (!d || d.price_cents == null || !d.listing_id) return null;

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const snaps = await db().from("price_snapshots")
    .select("price_cents, captured_at, source").eq("listing_id", d.listing_id).gte("captured_at", since).order("captured_at");
  if (snaps.error) throw snaps.error;
  const postedAt = new Date(d.created_at).getTime() - 60_000;
  const history: PricePoint[] = (snaps.data as { price_cents: number; captured_at: string; source: string }[])
    // o primeiro preço registrado junto com a oferta (do usuário ou do robô) não é histórico dela mesma
    .filter((s) => !((s.source === "post" || s.source === "robot") && new Date(s.captured_at).getTime() >= postedAt))
    .map((s) => ({ priceCents: s.price_cents, at: new Date(s.captured_at) }));

  const r = checkPrice({ priceCents: d.price_cents, listPriceCents: d.list_price_cents, history });
  const ev = await db().from("verifications").insert({
    deal_id: d.id, verdict: r.verdict, price_cents: d.price_cents, reference_price_cents: r.referenceCents,
    real_discount_bp: r.realDiscountBp, stores_compared: 1, history_days: r.historyDays,
    evidence: { min30: r.min30Cents, median: r.medianCents, points: history.length },
  });
  if (ev.error) console.error("[verify] registro", ev.error);
  const up = await db().from("deals").update({
    verdict: r.verdict, reference_price_cents: r.referenceCents, real_discount_bp: r.realDiscountBp, verified_at: new Date().toISOString(),
  }).eq("id", d.id);
  if (up.error) throw up.error;
  return r.verdict;
}

/** Liga a oferta ao anúncio da loja, grava o primeiro preço e calcula o selo. Nunca derruba a publicação. */
export async function trackNewDeal(o: { dealId: string; storeId: string; urlKey: string | null; url: string | null; priceCents: number | null; source: "post" | "robot"; externalId?: string | null }) {
  if (!o.urlKey || o.priceCents == null) return;
  try {
    const listingId = await ensureListing(o.storeId, o.urlKey, o.externalId ?? null, o.url ?? o.urlKey);
    if (!listingId) return;
    await addSnapshot(listingId, o.priceCents, o.source);
    const link = await db().from("deals").update({ listing_id: listingId }).eq("id", o.dealId);
    if (link.error) {
      console.error("[verify] listing já tem oferta ativa", link.error.message);
      return;
    }
    await verifyDeal(o.dealId);
  } catch (e) {
    console.error("[verify] falha ao registrar preço", e);
  }
}

export type HistoryPoint = { at: string; priceCents: number };

export async function getPriceHistory(dealId: string): Promise<HistoryPoint[]> {
  const d = await db().from("deals").select("listing_id").eq("id", dealId).maybeSingle();
  const listingId = (d.data as { listing_id: string | null } | null)?.listing_id;
  if (!listingId) return [];
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data, error } = await db().from("price_snapshots")
    .select("price_cents, captured_at").eq("listing_id", listingId).gte("captured_at", since).order("captured_at");
  if (error) throw error;
  return (data as { price_cents: number; captured_at: string }[]).map((s) => ({ at: s.captured_at, priceCents: s.price_cents }));
}

export type RecheckStats = { checked: number; updated: number; expired: number; failed: number };

/** Confere de novo o preço das ofertas no ar (cada anúncio no máximo a cada 6 horas). */
export async function recheckPublishedDeals(limit = 30): Promise<RecheckStats> {
  const stats: RecheckStats = { checked: 0, updated: 0, expired: 0, failed: 0 };
  const cutoff = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data, error } = await db().from("deals")
    .select("id, price_cents, url_submitted, url_resolved, listing:listings!deals_listing_id_fkey(id, checked_at)")
    .eq("status", "published").not("listing_id", "is", null).not("price_cents", "is", null).limit(300);
  if (error) throw error;
  type R = { id: string; price_cents: number; url_submitted: string | null; url_resolved: string | null; listing: { id: string; checked_at: string | null } | null };
  const due = (data as unknown as R[])
    .filter((r) => r.listing && (!r.listing.checked_at || r.listing.checked_at < cutoff) && (r.url_resolved ?? r.url_submitted))
    .sort((a, b) => (a.listing!.checked_at ?? "").localeCompare(b.listing!.checked_at ?? ""))
    .slice(0, limit);

  for (const r of due) {
    stats.checked++;
    try {
      const url = (r.url_resolved ?? r.url_submitted)!;
      // Mercado Livre bloqueia a página para robôs: com o app conectado, o preço vem da API oficial.
      const ml = parseMlUrl(url);
      const mlToken = ml ? await mlAccessToken() : null;
      const preview = ml && mlToken
        ? { priceCents: await mlPriceCents(mlToken, ml).catch((e) => { console.error("[recheck] ML", ml.id, e instanceof Error ? e.message : e); return null; }) }
        : await fetchPreview(url);
      if (!preview || preview.priceCents == null) {
        await db().from("listings").update({ checked_at: new Date().toISOString() }).eq("id", r.listing!.id);
        stats.failed++;
        continue;
      }
      await addSnapshot(r.listing!.id, preview.priceCents, "recheck");
      stats.updated++;
      const last = await db().from("price_snapshots").select("price_cents")
        .eq("listing_id", r.listing!.id).eq("source", "recheck").order("captured_at", { ascending: false }).limit(2);
      const lastTwo = ((last.data ?? []) as { price_cents: number }[]).map((s) => s.price_cents);
      if (priceRoseTwice(r.price_cents, lastTwo)) {
        await db().from("deals").update({ status: "expired", expired_reason: "O preço na loja subiu" }).eq("id", r.id);
        stats.expired++;
      } else {
        await verifyDeal(r.id);
      }
    } catch (e) {
      console.error("[recheck]", r.id, e);
      stats.failed++;
    }
  }
  return stats;
}

/** Expira o que passou da data de fim. */
export async function expireDueDeals(): Promise<number> {
  const { data, error } = await db().from("deals")
    .update({ status: "expired", expired_reason: "Chegou ao fim da validade" })
    .eq("status", "published").lt("expires_at", new Date().toISOString()).select("id");
  if (error) throw error;
  return (data ?? []).length;
}
// ---------- Mesmo produto em outras lojas (por código de barras) ----------

/** Liga o anúncio da oferta a um produto pelo GTIN (cria o produto se for novo). Devolve false se a oferta não tem anúncio. */
export async function linkDealToProduct(dealId: string, ean: string, title: string): Promise<boolean> {
  const d = await db().from("deals").select("listing_id").eq("id", dealId).maybeSingle();
  const listingId = (d.data as { listing_id: string | null } | null)?.listing_id;
  if (!listingId) return false;
  let productId: string | null = null;
  const found = await db().from("products").select("id").eq("ean", ean).maybeSingle();
  if (found.error) throw found.error;
  productId = (found.data as { id: string } | null)?.id ?? null;
  if (!productId) {
    const ins = await db().from("products").insert({ ean, normalized_title: title.toLowerCase().slice(0, 200) }).select("id").single();
    if (ins.error?.code === "23505") {
      productId = ((await db().from("products").select("id").eq("ean", ean).single()).data as { id: string }).id;
    } else if (ins.error) throw ins.error;
    else productId = (ins.data as { id: string }).id;
  }
  const up = await db().from("listings").update({ product_id: productId }).eq("id", listingId);
  if (up.error) throw up.error;
  return true;
}

export async function unlinkDealProduct(dealId: string): Promise<void> {
  const d = await db().from("deals").select("listing_id").eq("id", dealId).maybeSingle();
  const listingId = (d.data as { listing_id: string | null } | null)?.listing_id;
  if (listingId) await db().from("listings").update({ product_id: null }).eq("id", listingId);
}

/** Pesquisa e liga o produto pelo código de barras da página da loja. Roda depois da resposta, e nunca derruba a publicação. */
export async function linkProductFromPage(dealId: string, url: string, title: string): Promise<void> {
  try {
    const { preview } = await fetchLinkInfo(url);
    if (preview?.gtin) await linkDealToProduct(dealId, preview.gtin, title);
  } catch (e) {
    console.error("[produto] não foi possível ler o código de barras", e instanceof Error ? e.message : e);
  }
}

/** EAN do produto ligado à oferta (para o painel). */
export async function getDealEan(dealId: string): Promise<string | null> {
  const { data } = await db().from("deals").select("listing:listings!deals_listing_id_fkey(product:products(ean))").eq("id", dealId).maybeSingle();
  const row = data as unknown as { listing: { product: { ean: string | null } | null } | null } | null;
  return row?.listing?.product?.ean ?? null;
}

/** Outras ofertas no ar do mesmo produto, da mais barata para a mais cara. */
export async function listSameProductDeals(dealId: string, limit = 5): Promise<DealView[]> {
  const d = await db().from("deals").select("listing:listings!deals_listing_id_fkey(product_id)").eq("id", dealId).maybeSingle();
  const productId = (d.data as unknown as { listing: { product_id: string | null } | null } | null)?.listing?.product_id;
  if (!productId) return [];
  const ls = await db().from("listings").select("id").eq("product_id", productId);
  const ids = ((ls.data ?? []) as { id: string }[]).map((l) => l.id);
  if (ids.length === 0) return [];
  const nowIso = new Date().toISOString();
  const { data, error } = await db().from("deals_ranked").select(JOIN).in("listing_id", ids).neq("id", dealId).eq("status", "published")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`).not("price_cents", "is", null).order("price_cents", { ascending: true }).limit(limit);
  if (error) throw error;
  return toViews(data as unknown as DealJoinRow[], null);
}
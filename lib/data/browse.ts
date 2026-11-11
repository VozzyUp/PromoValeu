// Listagens por categoria, loja, cupons, grátis e busca (Supabase). Mesma janela de início/fim do feed.
import "server-only";
import { db } from "../supabase/db";
import type { Category, DealView, Store } from "../types";
import { ignoredAuthorIds } from "./relations";
import { searchTsQuery } from "../search-query";
import { JOIN, toViews, listCategories, listStores, type DealJoinRow } from "./supabase";

export type BrowseTab = "quentes" | "novas" | "descontos";
export const PAGE_SIZE = 20;

export type BrowseOpts = {
  viewerId: string | null;
  tab: BrowseTab;
  page: number;
  categoryId?: string;
  storeId?: string;
  coupons?: boolean;
  free?: boolean;
  query?: string;
};

export async function listDeals(o: BrowseOpts): Promise<{ items: DealView[]; hasNext: boolean }> {
  const offset = (Math.max(1, o.page) - 1) * PAGE_SIZE;
  const nowIso = new Date().toISOString();
  let q = db()
    .from("deals_ranked").select(JOIN).eq("status", "published")
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  if (o.categoryId) q = q.eq("category_id", o.categoryId);
  if (o.storeId) q = q.eq("store_id", o.storeId);
  if (o.coupons) q = q.not("coupon_code", "is", null);
  if (o.free) q = q.eq("price_cents", 0);
  const tsq = o.query ? searchTsQuery(o.query) : null;
  if (tsq) q = q.textSearch("search", tsq, { config: "pt_unaccent" });
  if (o.viewerId) {
    const ignored = await ignoredAuthorIds(o.viewerId);
    if (ignored.length) q = q.or(`author_id.is.null,author_id.not.in.(${ignored.join(",")})`);
  }
  if (o.tab === "novas") q = q.order("published_at", { ascending: false });
  else if (o.tab === "descontos") q = q.in("verdict", ["verified", "good_price"]).order("real_discount_bp", { ascending: false, nullsFirst: false });
  else q = q.order("hot_now", { ascending: false });

  const { data, error } = await q.range(offset, offset + PAGE_SIZE); // 1 a mais para saber se há próxima página
  if (error) throw error;
  const rows = data as unknown as DealJoinRow[];
  return { items: await toViews(rows.slice(0, PAGE_SIZE), o.viewerId), hasNext: rows.length > PAGE_SIZE };
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return (await listCategories()).find((c) => c.slug === slug) ?? null;
}

export async function getStoreBySlug(slug: string): Promise<Store | null> {
  const s = (await listStores()).find((x) => x.slug === slug);
  return s && s.status !== "blocked" ? s : null;
}

/** Endereços públicos para o sitemap: ofertas no ar, categorias, lojas e discussões. */
export async function sitemapEntries() {
  const [deals, discussions, categories, stores] = await Promise.all([
    db().from("deals").select("slug, updated_at").eq("status", "published").order("published_at", { ascending: false }).limit(5000),
    db().from("discussions").select("slug, last_activity_at").eq("status", "published").order("last_activity_at", { ascending: false }).limit(2000),
    listCategories(),
    listStores(),
  ]);
  return {
    deals: (deals.data ?? []) as { slug: string; updated_at: string }[],
    discussions: (discussions.data ?? []) as { slug: string; last_activity_at: string }[],
    categories,
    stores: stores.filter((s) => s.status === "active"),
  };
}

// Camada de dados Supabase. Mesmas assinaturas de ./memory.ts: as telas não sabem qual está ativa.
// Leitura e escrita com a chave secreta (no servidor), sempre depois da checagem de papel feita nas actions.
import "server-only";
import { randomBytes } from "node:crypto";
import { slugify } from "../format";
import { supabaseAdmin } from "../supabase/server";
import type { Category, Deal, DealView, FeedTab, Profile, Role, Store } from "../types";

/* ------------------------------------------------------------------ linhas do banco -> domínio */

type DealRow = {
  id: string; slug: string; code: string; title: string; description: string; author_id: string | null;
  source: Deal["source"]; store_id: string; category_id: string | null; url_submitted: string | null;
  starts_at: string | null; availability: "online" | "offline"; shipping_cents: number | null; ships_from: string | null;
  coupon_kind: Deal["couponKind"]; coupon_amount_cents: number | null; is_sponsored?: boolean;
  price_cents: number | null; list_price_cents: number | null; coupon_code: string | null;
  coupon_percent: number | null; image_path: string | null; verdict: Deal["verdict"];
  real_discount_bp: number | null; status: Deal["status"]; reject_reason: string | null;
  published_at: string | null; expires_at: string | null; votes_up: number; votes_down: number;
  clicks_total: number; comments_count: number; created_at: string;
};
type StoreRow = { id: string; name: string; slug: string; domains: string[]; logo_url?: string | null; status: Store["status"] };
const toStore = ({ logo_url, ...s }: StoreRow): Store => ({ ...s, logoUrl: logo_url ?? null });
type CategoryRow = { id: string; name: string; slug: string };
type AuthorRow = { id: string; username: string; display_name: string; avatar_url: string | null; role: Role };
type ProfileRow = AuthorRow & {
  reputation: number; trusted: boolean; approved_posts: number; banned_at: string | null; created_at: string;
};
export type DealJoinRow = DealRow & { store: StoreRow; category: CategoryRow | null; author: AuthorRow | null };

const DEAL_COLS =
  "id, slug, code, title, description, author_id, source, store_id, category_id, url_submitted, price_cents, " +
  "list_price_cents, coupon_code, coupon_percent, image_path, verdict, real_discount_bp, status, reject_reason, " +
  "published_at, expires_at, votes_up, votes_down, clicks_total, comments_count, created_at, " +
  "starts_at, availability, shipping_cents, ships_from, coupon_kind, coupon_amount_cents, is_sponsored";
export const JOIN =
  `${DEAL_COLS}, store:stores!inner(id, name, slug, domains, logo_url, status), category:categories(id, name, slug), ` +
  "author:profiles!deals_author_id_fkey(id, username, display_name, avatar_url, role)";

function imageUrl(path: string | null) {
  if (!path) return null;
  return supabaseAdmin().storage.from("deal-images").getPublicUrl(path).data.publicUrl;
}

function toDeal(r: DealRow): Deal {
  return {
    id: r.id, slug: r.slug, code: r.code, title: r.title, description: r.description, authorId: r.author_id,
    source: r.source, storeId: r.store_id, categoryId: r.category_id, urlSubmitted: r.url_submitted,
    priceCents: r.price_cents, listPriceCents: r.list_price_cents, couponCode: r.coupon_code,
    couponPercent: r.coupon_percent, imageUrl: imageUrl(r.image_path), verdict: r.verdict,
    realDiscountBp: r.real_discount_bp, status: r.status, rejectReason: r.reject_reason,
    publishedAt: r.published_at, expiresAt: r.expires_at, votesUp: r.votes_up, votesDown: r.votes_down,
    clicksTotal: r.clicks_total, commentsCount: r.comments_count, createdAt: r.created_at,
    startsAt: r.starts_at, availability: r.availability, shippingCents: r.shipping_cents, shipsFrom: r.ships_from,
    couponKind: r.coupon_kind, couponAmountCents: r.coupon_amount_cents, isSponsored: !!r.is_sponsored,
  };
}

function toProfile(r: ProfileRow): Profile {
  return {
    id: r.id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url, role: r.role,
    reputation: r.reputation, trusted: r.trusted, approvedPosts: r.approved_posts, bannedAt: r.banned_at,
    createdAt: r.created_at,
  };
}

/** Mesma conta da camada em memória: cada voto vale 10°. */
export function temperatureOf(d: Pick<Deal, "votesUp" | "votesDown">) {
  return (d.votesUp - d.votesDown) * 10;
}

async function myVotes(dealIds: string[], viewerId: string | null) {
  const map = new Map<string, -1 | 1>();
  if (!viewerId || dealIds.length === 0) return map;
  const { data, error } = await supabaseAdmin()
    .from("votes").select("deal_id, value").eq("user_id", viewerId).in("deal_id", dealIds);
  if (error) throw error;
  for (const v of data as { deal_id: string; value: -1 | 1 }[]) map.set(v.deal_id, v.value);
  return map;
}

export async function toViews(rows: DealJoinRow[], viewerId: string | null): Promise<DealView[]> {
  const votes = await myVotes(rows.map((r) => r.id), viewerId);
  return rows.map((r) => {
    const d = toDeal(r);
    return {
      ...d,
      store: toStore(r.store),
      category: r.category,
      author: r.author
        ? { id: r.author.id, username: r.author.username, displayName: r.author.display_name, avatarUrl: r.author.avatar_url, role: r.author.role }
        : { id: "", username: "removido", displayName: "Usuário removido", avatarUrl: null, role: "user" as const },
      temperature: temperatureOf(d),
      myVote: votes.get(d.id) ?? 0,
    };
  });
}

/** Código curto do /ir/ e sufixo do slug: só [0-9a-f], nunca termina o slug com "-". */
function newCode() {
  return randomBytes(4).toString("hex");
}

/* ------------------------------------------------------------------ leitura */

export async function listFeed(opts: { tab: FeedTab; viewerId: string | null; limit?: number; offset?: number }) {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  let q = supabaseAdmin().from("deals_ranked").select(JOIN).eq("status", "published");
  if (opts.tab === "novas") {
    q = q.order("published_at", { ascending: false });
  } else if (opts.tab === "descontos") {
    q = q.in("verdict", ["verified", "good_price"]).order("real_discount_bp", { ascending: false, nullsFirst: false });
  } else {
    q = q.order("hot_now", { ascending: false });
  }
  // Pede 1 a mais para saber se existe próxima página.
  const { data, error } = await q.range(offset, offset + limit);
  if (error) throw error;
  const rows = data as unknown as DealJoinRow[];
  const items = await toViews(rows.slice(0, limit), opts.viewerId);
  return { items, nextOffset: rows.length > limit ? offset + limit : null };
}

export async function listHot(limit: number, viewerId: string | null) {
  return (await listFeed({ tab: "quentes", viewerId, limit })).items;
}

export async function getDealBySlug(slug: string, viewer: { id: string; role: string } | null) {
  const { data, error } = await supabaseAdmin().from("deals").select(JOIN).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as DealJoinRow;
  const visible = row.status === "published" || row.status === "expired";
  const canSeeHidden = viewer && (viewer.id === row.author_id || viewer.role === "admin" || viewer.role === "moderator");
  if (!visible && !canSeeHidden) return null;
  return (await toViews([row], viewer?.id ?? null))[0];
}

export async function getDealByCode(code: string) {
  const { data, error } = await supabaseAdmin().from("deals").select(DEAL_COLS).eq("code", code).maybeSingle();
  if (error) throw error;
  return data ? toDeal(data as unknown as DealRow) : null;
}

/** Modelo do nosso link de afiliado da loja (null = sem afiliado). */
export async function getStoreAffiliateTemplate(storeId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from("stores").select("affiliate_template").eq("id", storeId).maybeSingle();
  if (error) throw error;
  return (data as { affiliate_template: string | null } | null)?.affiliate_template ?? null;
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabaseAdmin().from("categories").select("id, name, slug").order("sort");
  if (error) throw error;
  return data as CategoryRow[];
}

export async function listStores(): Promise<Store[]> {
  const { data, error } = await supabaseAdmin().from("stores").select("id, name, slug, domains, logo_url, status").order("name");
  if (error) throw error;
  return (data as StoreRow[]).map(toStore);
}

export async function getProfile(id: string) {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("id, username, display_name, avatar_url, role, reputation, trusted, approved_posts, banned_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toProfile(data as ProfileRow) : null;
}

export async function isUsernameTaken(username: string) {
  const { count, error } = await supabaseAdmin()
    .from("profiles").select("id", { count: "exact", head: true }).eq("username", username);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function listPendingDeals() {
  const { data, error } = await supabaseAdmin()
    .from("deals").select(JOIN).eq("status", "pending").order("created_at").limit(100);
  if (error) throw error;
  return toViews(data as unknown as DealJoinRow[], null);
}

/* ------------------------------------------------------------------ escrita */

export async function recordClick(dealId: string, visitorHash: string, channel: string) {
  const { error } = await supabaseAdmin().rpc("record_click", {
    p_deal: dealId, p_visitor: visitorHash, p_channel: channel, p_user: null, p_link_used: "author",
  } as never);
  if (error) throw error;
}

export async function createStoreForHost(host: string) {
  const name = host.split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
  const slug = slugify(host);
  const cols = "id, name, slug, domains, status";
  const { data, error } = await supabaseAdmin()
    .from("stores")
    .insert({ name, slug, domains: [host], status: "pending_review" } as never)
    .select(cols)
    .single();
  if (!error) return data as StoreRow;
  if (error.code !== "23505") throw error;
  // Dois envios da mesma loja nova ao mesmo tempo: usa a que já foi criada, sem mudar o status dela.
  const existing = await supabaseAdmin().from("stores").select(cols).eq("slug", slug).single();
  if (existing.error) throw existing.error;
  return existing.data as StoreRow;
}

export type NewDeal = {
  authorId: string;
  title: string;
  description: string;
  storeId: string;
  categoryId: string | null;
  urlSubmitted: string | null;
  priceCents: number | null;
  listPriceCents: number | null;
  couponCode: string | null;
  publish: boolean;
  source?: "user" | "admin" | "robot";
  // Passo a passo de publicar (opcionais: o formulário simples não usa).
  urlKey?: string | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  availability?: "online" | "offline";
  shippingCents?: number | null;
  shipsFrom?: string | null;
  couponKind?: "percent" | "amount" | "free_shipping" | "other" | null;
  couponPercent?: number | null;
  couponAmountCents?: number | null;
};

export async function createDeal(input: NewDeal) {
  const now = new Date().toISOString();
  // Colisão de código é rara (4 bytes); tenta de novo em vez de falhar o envio.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    const { data, error } = await supabaseAdmin()
      .from("deals")
      .insert({
        slug: `${slugify(input.title)}-${code.slice(0, 4)}`,
        code,
        title: input.title,
        description: input.description,
        author_id: input.authorId,
        source: input.source ?? "user",
        store_id: input.storeId,
        category_id: input.categoryId,
        url_submitted: input.urlSubmitted,
        url_key: input.urlKey ?? null,
        price_cents: input.priceCents,
        list_price_cents: input.listPriceCents,
        coupon_code: input.couponCode,
        coupon_kind: input.couponKind ?? null,
        coupon_percent: input.couponPercent ?? null,
        coupon_amount_cents: input.couponAmountCents ?? null,
        starts_at: input.startsAt ?? null,
        expires_at: input.expiresAt ?? null,
        availability: input.availability ?? "online",
        shipping_cents: input.shippingCents ?? null,
        ships_from: input.shipsFrom ?? null,
        status: input.publish ? "published" : "pending",
        published_at: input.publish ? now : null,
      } as never)
      .select(DEAL_COLS)
      .single();
    if (!error) return toDeal(data as unknown as DealRow);
    if (error.code !== "23505") throw error; // 23505 = unique_violation (slug ou code)
  }
  throw new Error("Não foi possível gerar um código único para a oferta");
}

export async function countDealsByAuthorSince(authorId: string, sinceIso: string) {
  const { count, error } = await supabaseAdmin()
    .from("deals").select("id", { count: "exact", head: true }).eq("author_id", authorId).gte("created_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

export async function moderateDeal(id: string, action: "approve" | "reject", reason: string | null, moderatorId: string | null = null) {
  const { data, error } = await supabaseAdmin().rpc("moderate_deal", {
    p_deal: id, p_action: action, p_reason: reason, p_moderator: moderatorId,
  } as never);
  if (error) throw error;
  return data ? { id: data as string } : null;
}

export async function vote(dealId: string, userId: string, value: -1 | 1) {
  const { data, error } = await supabaseAdmin().rpc("vote_toggle", { p_deal: dealId, p_user: userId, p_value: value } as never);
  if (error) throw error;
  const row = (data as { temperature: number; my_vote: number }[])[0];
  if (!row) return null;
  return { temperature: row.temperature, myVote: row.my_vote as -1 | 0 | 1 };
}

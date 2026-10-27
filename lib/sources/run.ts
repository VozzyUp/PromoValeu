// Robô das fontes: lê as publicações novas de um canal ou grupo do Telegram e monta ofertas com o link limpo da loja.
// Por padrão tudo vai para a fila de aprovação. Cada publicação lida fica registrada em source_items com o motivo.
import "server-only";
import { createDeal, createStoreForHost, listStores } from "../data";
import { isHostBlocked } from "../data/admin";
import { autoCategoryId } from "../data/auto-category";
import { notifyPublished, saveDealImages } from "../data/publish";
import { linkDealToProduct, trackNewDeal } from "../data/verification";
import { formatPrice } from "../format";
import { checkImage } from "../image-check";
import { fetchImageBytes, fetchLinkInfo, safeGet } from "../link-preview";
import { parsePreview, type Preview } from "../link-preview-parse";
import { findStoreForHost } from "../links";
import { systemAuthorId } from "../robot/shopee";
import { db } from "../supabase/db";
import { urlKey } from "../url-key";
import { hostOf, isKnownStoreHost } from "./clean-url";
import { cleanPageTitle, parsePost, type CouponInfo } from "./parse-post";
import { resolveStoreLink, type Fetcher } from "./resolve";
import { readAccountPosts, withAccount } from "./telegram-account";
import { channelLabel } from "./parse-web";
import { fetchPublicChannel } from "./telegram-web";
import type { RawPost } from "./types";
import { readWhatsappPosts } from "./whatsapp";

const MAX_AGE_MS = 24 * 3600_000; // publicação mais velha que isso provavelmente já acabou
const REPOST_DAYS = 14;
const COUPON_DAYS = 7;
const IMAGE_MAX = 3 * 1024 * 1024;

export type SourceRow = {
  id: string; name: string; kind: "telegram_public" | "telegram_account" | "whatsapp_channel" | "whatsapp_group"; target: string; active: boolean; category_id: string | null;
  min_discount_bp: number; max_price_cents: number | null; block_words: string[]; per_run: number; take_coupons: boolean;
  auto_publish: boolean; last_message_id: number | null; target_title: string | null;
};

export type SourceStats = { read: number; new: number; created: number; published: number; duplicates: number; filtered: number; noStoreLink: number; ignored: number; errors: number };

type ItemStatus = "created" | "duplicate" | "filtered" | "no_store_link" | "error";
type Store = { id: string; name: string; slug: string; domains: string[] };

// SOURCES_OFFLINE=1 só nos testes: nada de abrir lojas de verdade.
const offline = () => process.env.SOURCES_OFFLINE === "1";

const fetcher: Fetcher = async (url) => {
  if (offline()) throw new Error("sem rede nos testes");
  const got = await safeGet(url.toString(), { maxBytes: 900_000, accept: "text/html,application/xhtml+xml,*/*;q=0.8", maxRedirects: 6 });
  return { status: got.status, url: got.finalUrl, html: /html/i.test(got.contentType) ? got.body.toString("utf8") : null };
};

function couponTitle(c: CouponInfo, storeName: string): string {
  const what = c.kind === "percent" && c.percent ? `${c.percent}% OFF`
    : c.kind === "amount" && c.amountCents ? `${formatPrice(c.amountCents)} OFF`
    : c.kind === "free_shipping" ? "frete grátis" : "de desconto";
  const min = c.minOrderCents ? ` em compras acima de ${formatPrice(c.minOrderCents)}` : "";
  return `Cupom ${what}${min} - ${storeName}`.replace(/ /g, " ").slice(0, 140); // o formato de moeda usa espaço fixo
}

const fit = (t: string) => (t.length > 140 ? `${t.slice(0, 137)}...` : t);

export async function runSource(id: string): Promise<SourceStats> {
  const { data, error } = await db().from("sources").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  const src = data as SourceRow | null;
  if (!src) throw new Error("Fonte não encontrada.");
  try {
    if (src.kind === "telegram_public") {
      const page = await fetchPublicChannel(src.target);
      const label = channelLabel(page);
      if (label !== src.target_title) await db().from("sources").update({ target_title: label }).eq("id", id);
      return await processPosts(src, page.posts, async (p) => (p.imageUrl && !offline() ? fetchImageBytes(p.imageUrl, IMAGE_MAX) : null));
    }
    if (src.kind === "whatsapp_channel" || src.kind === "whatsapp_group") {
      const posts = await readWhatsappPosts(src.kind, src.target);
      return await processPosts(src, posts, async () => null); // a foto vem da página da loja
    }
    return await withAccount(async (c) => {
      const { posts, photo } = await readAccountPosts(c, src.target, src.last_message_id, 40);
      return processPosts(src, posts, (p) => photo(p.id));
    });
  } catch (e) {
    await db().from("sources").update({ last_run_at: new Date().toISOString(), last_error: e instanceof Error ? e.message.slice(0, 300) : "Falha desconhecida." }).eq("id", id);
    throw e;
  }
}

async function processPosts(src: SourceRow, posts: RawPost[], postImage: (p: RawPost) => Promise<Uint8Array | null>): Promise<SourceStats> {
  const stats: SourceStats = { read: posts.length, new: 0, created: 0, published: 0, duplicates: 0, filtered: 0, noStoreLink: 0, ignored: 0, errors: 0 };
  const last = src.last_message_id;
  const fresh = posts.filter((p) => last == null || p.id > last);
  stats.new = fresh.length;
  // Primeira leitura: só as mais recentes, para não despejar o histórico inteiro na fila.
  const queue = last == null ? fresh.slice(-src.per_run) : fresh;

  const stores = await listStores();
  const isStoreHost = (h: string) => !!findStoreForHost(h, stores) || isKnownStoreHost(h);
  const authorId = await systemAuthorId();
  const blockWords = src.block_words.map((w) => w.toLowerCase()).filter(Boolean);

  let cursor = last ?? (fresh.length > queue.length ? queue[0].id - 1 : null);
  for (const p of queue) {
    if (stats.created >= src.per_run) break;
    cursor = p.id;
    const item = {
      source_id: src.id, message_id: p.id, posted_at: p.postedAt?.toISOString() ?? null, post_url: p.postUrl,
      link: null as string | null, store_url: null as string | null, title: null as string | null,
      price_cents: null as number | null, list_price_cents: null as number | null, coupon_code: null as string | null,
    };
    const record = async (status: ItemStatus, reason: string | null, dealId: string | null = null) => {
      if (status === "duplicate") stats.duplicates++;
      else if (status === "filtered") stats.filtered++;
      else if (status === "no_store_link") stats.noStoreLink++;
      else if (status === "error") stats.errors++;
      await db().from("source_items").upsert({ ...item, status, reason: reason?.slice(0, 300) ?? null, deal_id: dealId }, { onConflict: "source_id,message_id", ignoreDuplicates: true });
    };

    try {
      if (p.postedAt && Date.now() - p.postedAt.getTime() > MAX_AGE_MS) {
        stats.ignored++;
        continue;
      }
      const parsed = parsePost(p);
      if (parsed.links.length === 0) {
        stats.ignored++; // aviso, sorteio, recado: não é oferta
        continue;
      }
      item.link = parsed.links[0];
      item.title = parsed.title;
      item.price_cents = parsed.priceCents;
      item.list_price_cents = parsed.listPriceCents;
      item.coupon_code = parsed.coupon?.code ?? null;

      const lower = p.text.toLowerCase();
      const blocked = blockWords.find((w) => lower.includes(w));
      if (blocked) {
        await record("filtered", `Tem a palavra bloqueada "${blocked}".`);
        continue;
      }

      const res = await resolveStoreLink(parsed.links, isStoreHost, fetcher);
      item.link = res.link ?? parsed.links[0];
      item.store_url = res.storeUrl?.toString() ?? null;

      const storeFor = async (host: string): Promise<Store | null> => {
        const found = findStoreForHost(host, stores);
        if (found?.status === "blocked" || (await isHostBlocked(host))) return null;
        return found ?? ((await createStoreForHost(host)) as Store);
      };

      // Cupom da loja inteira (sem produto e sem preço).
      if (parsed.priceCents == null && parsed.coupon) {
        const c = parsed.coupon;
        if (!src.take_coupons) {
          await record("filtered", "Cupom da loja (cupons desligados nesta fonte).");
          continue;
        }
        if (!c.code && c.kind !== "free_shipping") {
          await record("filtered", "Fala de cupom, mas sem o código.");
          continue;
        }
        const host = res.storeUrl ? hostOf(res.storeUrl) : res.storeHost;
        if (!host) {
          await record("no_store_link", res.reason);
          continue;
        }
        const store = await storeFor(host);
        if (!store) {
          await record("filtered", "Loja bloqueada.");
          continue;
        }
        const key = `cupom:${store.slug}:${(c.code ?? "frete").toLowerCase()}`;
        const since = new Date(Date.now() - COUPON_DAYS * 86400_000).toISOString();
        const dup = await db().from("deals").select("id").eq("url_key", key).gte("created_at", since).limit(1);
        if (dup.data?.length) {
          await record("duplicate", "Esse cupom já entrou nos últimos 7 dias.");
          continue;
        }
        const title = couponTitle(c, store.name);
        item.title = title;
        const url = res.storeUrl?.toString() ?? `https://www.${store.domains[0] ?? host}/`;
        const deal = await createDeal({
          authorId, title, description: [c.text, ...parsed.facts].filter(Boolean).join(" "), storeId: store.id, categoryId: src.category_id ?? (await autoCategoryId(title)),
          urlSubmitted: url, urlKey: key, priceCents: null, listPriceCents: null, couponCode: c.code,
          couponKind: c.kind, couponPercent: c.percent, couponAmountCents: c.amountCents, publish: src.auto_publish, source: "robot",
        });
        const img = await postImage(p).catch(() => null);
        if (img && !checkImage(img)) await saveDealImages(deal.id, [img]);
        stats.created++;
        if (deal.status === "published") {
          stats.published++;
          await notifyPublished(deal.id);
        }
        await record("created", null, deal.id);
        continue;
      }

      if (!res.storeUrl) {
        await record("no_store_link", res.reason);
        continue;
      }
      const host = hostOf(res.storeUrl);
      const store = await storeFor(host);
      if (!store) {
        await record("filtered", "Loja bloqueada.");
        continue;
      }
      let preview: Preview | null = res.page ? parsePreview(res.page.html, res.page.url.toString()) : null;
      if (!preview && !offline()) preview = (await fetchLinkInfo(res.storeUrl.toString())).preview;

      const priceCents = parsed.priceCents ?? preview?.priceCents ?? null;
      const pageTitle = cleanPageTitle(preview?.title);
      // Linha com cara forte de nome de produto ganha; se a publicação só tem chamada, vale o título da página da loja.
      const title = parsed.title && parsed.titleScore >= 3 ? parsed.title : pageTitle ?? parsed.title;
      // Sem nome confiável (a loja não mostrou a página e o texto só tem chamada): vai para a fila mesmo com "publicar direto".
      const unsureTitle = !pageTitle && parsed.titleScore < 2;
      item.title = title;
      item.price_cents = priceCents;
      if (priceCents == null) {
        await record("filtered", "Sem preço na publicação nem na página da loja.");
        continue;
      }
      if (!title || title.length < 10) {
        await record("filtered", "Não deu para saber o nome do produto.");
        continue;
      }
      if (src.max_price_cents != null && priceCents > src.max_price_cents) {
        await record("filtered", `Acima do preço máximo (${formatPrice(src.max_price_cents)}).`);
        continue;
      }
      const list = parsed.listPriceCents;
      if (src.min_discount_bp > 0) {
        const bp = list ? Math.round(((list - priceCents) / list) * 10000) : 0;
        if (!list || bp < src.min_discount_bp) {
          await record("filtered", list ? `Desconto de ${(bp / 100).toFixed(0)}%, abaixo do mínimo.` : "Sem preço antigo para medir o desconto.");
          continue;
        }
      }
      const key = urlKey(res.storeUrl);
      const since = new Date(Date.now() - REPOST_DAYS * 86400_000).toISOString();
      const dup = await db().from("deals").select("id").eq("url_key", key).gte("created_at", since).limit(1);
      if (dup.data?.length) {
        await record("duplicate", "Esse produto já entrou nos últimos 14 dias.");
        continue;
      }

      const deal = await createDeal({
        authorId, title: fit(title), description: parsed.facts.join(" "), storeId: store.id, categoryId: src.category_id ?? (await autoCategoryId(title)),
        urlSubmitted: res.storeUrl.toString(), urlKey: key, priceCents, listPriceCents: list, couponCode: parsed.coupon?.code ?? null,
        publish: src.auto_publish && !unsureTitle, source: "robot",
      });
      stats.created++;

      // Foto: a da página da loja; se a loja não deixar ler, a da publicação.
      let img: Uint8Array | null = null;
      if (preview?.imageUrl && !offline()) img = await fetchImageBytes(preview.imageUrl, IMAGE_MAX);
      if (!img || checkImage(img)) img = await postImage(p).catch(() => null);
      if (img && !checkImage(img)) await saveDealImages(deal.id, [img]);

      await trackNewDeal({ dealId: deal.id, storeId: store.id, urlKey: key, url: res.storeUrl.toString(), priceCents, source: "robot" });
      if (preview?.gtin) await linkDealToProduct(deal.id, preview.gtin, title).catch(() => false);

      const v = await db().from("deals").select("verdict").eq("id", deal.id).single();
      if ((v.data as { verdict: string } | null)?.verdict === "inflated") {
        await db().from("deals").update({ status: "rejected", reject_reason: "Desconto inflado (fonte do Telegram)" }).eq("id", deal.id);
        stats.created--;
        await record("filtered", "Desconto inflado pelo histórico de preço: recusada.", deal.id);
        continue;
      }
      if (deal.status === "published") {
        stats.published++;
        await notifyPublished(deal.id);
      }
      await record("created", null, deal.id);
    } catch (e) {
      console.error("[fonte]", src.id, p.id, e);
      await record("error", e instanceof Error ? e.message : "Falha desconhecida.").catch(() => {});
    }
  }

  await db().from("sources").update({ last_message_id: cursor, last_run_at: new Date().toISOString(), last_error: null }).eq("id", src.id);
  return stats;
}

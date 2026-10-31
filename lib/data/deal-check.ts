// Conferência das ofertas no ar: lê o preço na loja (API, página ou IA), grava o resultado com hora e agenda a próxima.
// Também acompanha o preço dos produtos depois que a oferta acaba (histórico) e recebe o "Funcionou pra você?".
import "server-only";
import { aiPricePrompt, nextCheckDelayMs, parseAiPrice, priceContext, type CheckState } from "../check-schedule";
import { complete, type AnthropicConfig } from "../integrations/anthropic";
import { mlQuote } from "../integrations/mercadolivre";
import { safeGet } from "../link-preview";
import { parsePreview } from "../link-preview-parse";
import { parseMlUrl } from "../ml-url";
import { paymentCondition, priceRoseTwice, priceWithCoupon } from "../price-check";
import { db } from "../supabase/db";
import { getIntegrationConfig, mlAccessToken } from "./integrations";
import { refreshMarketPrice } from "./market";
import { addSnapshot, verifyDeal } from "./verification";

const AI_DAILY_LIMIT = 300; // leituras de página pela IA por dia (custo)
const RISE_TOLERANCE = 0.15;

type Method = "api" | "page" | "ai";
type StoreRead = { cents: number | null; ended?: boolean; rateLimited?: boolean; method: Method; detail: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

async function aiConfig(): Promise<AnthropicConfig | null> {
  try {
    const cfg = await getIntegrationConfig<AnthropicConfig>("anthropic");
    return cfg?.apiKey ? { apiKey: cfg.apiKey, model: cfg.model || "claude-haiku-5-5" } : null;
  } catch {
    return null;
  }
}

async function aiBudgetLeft(): Promise<boolean> {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await db().from("deal_checks").select("id", { count: "exact", head: true }).eq("method", "ai").gte("created_at", since);
  return (count ?? 0) < AI_DAILY_LIMIT;
}

/** Preço atual na loja. Ordem: API oficial (Mercado Livre) → página → IA lendo a página. Nunca lança. */
export async function readStorePrice(url: string, ctx: { title: string; dealCents: number }): Promise<StoreRead> {
  const ml = parseMlUrl(url);
  if (ml) {
    const token = await mlAccessToken().catch(() => null);
    if (token) {
      try {
        const q = await mlQuote(token, ml);
        if (!q.active) return { cents: null, ended: true, method: "api", detail: "Anúncio pausado ou encerrado no Mercado Livre" };
        return { cents: q.cents, method: "api", detail: q.cents == null ? "a API não informou o preço" : `API do Mercado Livre${q.promoProbe ? ` · ${q.promoProbe}` : ""}` };
      } catch (e) {
        const m = msg(e);
        if (/\b429\b/.test(m)) return { cents: null, rateLimited: true, method: "api", detail: m };
        // 403 em parte dos anúncios: tenta a página antes de desistir.
        if (!/\b403\b/.test(m)) return { cents: null, method: "api", detail: m };
      }
    }
  }
  let html: string;
  let finalUrl = url;
  try {
    const got = await safeGet(url, { maxBytes: 1_500_000, accept: "text/html,application/xhtml+xml" });
    if (got.status < 200 || got.status >= 300 || !/html/i.test(got.contentType)) {
      return { cents: null, method: "page", detail: `${new URL(url).hostname}: a loja respondeu ${got.status}` };
    }
    html = got.body.toString("utf8");
    finalUrl = got.finalUrl.toString();
  } catch (e) {
    return { cents: null, method: "page", detail: `${new URL(url).hostname}: ${msg(e)}` };
  }
  const p = parsePreview(html, finalUrl);
  if (p.priceCents != null) return { cents: p.priceCents, method: "page", detail: "página da loja" };

  // A página veio, mas o leitor não achou o preço: a IA lê os trechos com "R$".
  const text = priceContext(html);
  if (!text) return { cents: null, method: "page", detail: `${new URL(url).hostname}: a página não mostra preço ao servidor` };
  const cfg = await aiConfig();
  if (!cfg) return { cents: null, method: "page", detail: `${new URL(url).hostname}: sem preço na página e a IA está desligada` };
  if (!(await aiBudgetLeft())) return { cents: null, method: "page", detail: "limite diário de leituras pela IA atingido" };
  try {
    const prompt = aiPricePrompt(ctx.title, text);
    const out = parseAiPrice(await complete(cfg, { system: prompt.system, user: prompt.user, maxTokens: 60 }), ctx.dealCents);
    if (!out) return { cents: null, method: "ai", detail: `${new URL(url).hostname}: a IA não achou um preço seguro` };
    return { cents: out.cents, method: "ai", detail: `IA leu a página${out.pixCents ? ` · Pix R$ ${(out.pixCents / 100).toFixed(2)}` : ""}` };
  } catch (e) {
    return { cents: null, method: "ai", detail: `IA: ${msg(e)}` };
  }
}

type DealRow = {
  id: string; title: string; status: string; price_cents: number | null; url_submitted: string | null; url_resolved: string | null; created_at: string;
  description: string | null; coupon_code: string | null; coupon_percent: number | null; coupon_amount_cents: number | null; listing_id: string | null;
};
const DEAL_COLS = "id, title, status, price_cents, url_submitted, url_resolved, created_at, description, coupon_code, coupon_percent, coupon_amount_cents, listing_id";

export type CheckOutcome = "ok" | "price_up" | "ended" | "unverifiable" | "error" | "rate_limited" | "skipped";

async function logCheck(dealId: string, method: Method, outcome: Exclude<CheckOutcome, "rate_limited" | "skipped">, priceCents: number | null, detail: string) {
  const { error } = await db().from("deal_checks").insert({ deal_id: dealId, method, outcome, price_cents: priceCents, detail: detail.slice(0, 300) });
  if (error) console.error("[conferência] registro", error.message);
}

async function schedule(d: DealRow, state: CheckState | null, delayMs?: number) {
  const now = Date.now();
  const next = new Date(now + (delayMs ?? nextCheckDelayMs(now - new Date(d.created_at).getTime()))).toISOString();
  const patch: Record<string, unknown> = { next_check_at: next };
  if (state) Object.assign(patch, { check_state: state, last_checked_at: new Date(now).toISOString() });
  const { error } = await db().from("deals").update(patch).eq("id", d.id);
  if (error) throw error;
}

/**
 * Confere uma oferta agora. Preço acima do anunciado (com o cupom aplicado) marca "preço subiu";
 * duas conferências seguidas acima encerram a oferta. Anúncio encerrado na API encerra na hora.
 */
export async function checkDeal(dealId: string): Promise<{ outcome: CheckOutcome; detail: string }> {
  const { data, error } = await db().from("deals").select(DEAL_COLS).eq("id", dealId).maybeSingle();
  if (error) throw error;
  const d = data as DealRow | null;
  const url = d?.url_resolved ?? d?.url_submitted;
  if (!d || d.status !== "published" || !d.listing_id || d.price_cents == null || !url) {
    if (d?.status === "published") await db().from("deals").update({ next_check_at: null }).eq("id", d.id);
    return { outcome: "skipped", detail: "oferta sem link, sem preço ou fora do ar" };
  }

  const read = await readStorePrice(url, { title: d.title, dealCents: d.price_cents });
  if (read.rateLimited) {
    await schedule(d, null, 10 * 60_000); // limite da API: tenta de novo em 10 min, sem contar como falha da oferta
    return { outcome: "rate_limited", detail: read.detail };
  }
  if (read.ended) {
    await logCheck(d.id, read.method, "ended", null, read.detail);
    await db().from("deals").update({ status: "expired", expired_reason: read.detail, last_checked_at: new Date().toISOString(), next_check_at: null }).eq("id", d.id);
    return { outcome: "ended", detail: read.detail };
  }

  // Outra loja: o preço do mesmo produto no Mercado Livre entra na conta do selo "Desconto real".
  if (!parseMlUrl(url)) await refreshMarketPrice(d.id).catch(() => false);

  if (read.cents == null) {
    await logCheck(d.id, read.method, "unverifiable", null, read.detail);
    await db().from("listings").update({ checked_at: new Date().toISOString() }).eq("id", d.listing_id);
    await schedule(d, "unverifiable");
    return { outcome: "unverifiable", detail: read.detail };
  }

  await addSnapshot(d.listing_id, read.cents, "recheck");
  const last = await db().from("price_snapshots").select("price_cents")
    .eq("listing_id", d.listing_id).eq("source", "recheck").order("captured_at", { ascending: false }).limit(2);
  const lastTwo = ((last.data ?? []) as { price_cents: number }[]).map((s) => s.price_cents);
  const coupon = { code: d.coupon_code, percent: d.coupon_percent, amountCents: d.coupon_amount_cents };
  const withCoupon = lastTwo.map((p) => priceWithCoupon(p, coupon, d.price_cents!));

  // Base de comparação: o preço da oferta (com o cupom aplicado na vitrine) ou, quando o desconto não aparece na loja
  // (Pix, à vista, só no app, cupom de valor desconhecido), a primeira vitrine lida depois da oferta.
  let base = d.price_cents;
  let readings = withCoupon.map((x) => x.cents);
  if (!withCoupon.every((x) => x.known) || paymentCondition(d.description)) {
    const first = await db().from("price_snapshots").select("price_cents")
      .eq("listing_id", d.listing_id).eq("source", "recheck").gte("captured_at", d.created_at).order("captured_at").limit(1).maybeSingle();
    base = (first.data as { price_cents: number } | null)?.price_cents ?? read.cents;
    readings = lastTwo;
  }

  if (priceRoseTwice(base, readings, RISE_TOLERANCE)) {
    await logCheck(d.id, read.method, "price_up", read.cents, `${read.detail} · subiu em duas conferências seguidas`);
    await db().from("deals").update({
      status: "expired", expired_reason: "O preço na loja subiu", check_state: "price_up", last_checked_at: new Date().toISOString(), next_check_at: null,
    }).eq("id", d.id);
    return { outcome: "price_up", detail: "encerrada: o preço subiu em duas conferências seguidas" };
  }
  if (readings[0] > base * (1 + RISE_TOLERANCE)) {
    await logCheck(d.id, read.method, "price_up", read.cents, read.detail);
    await schedule(d, "price_up", 30 * 60_000); // confere de novo logo: pode ter sido só uma oscilação
    return { outcome: "price_up", detail: read.detail };
  }
  await logCheck(d.id, read.method, "ok", read.cents, read.detail);
  await verifyDeal(d.id);
  await schedule(d, "active");
  return { outcome: "ok", detail: read.detail };
}

export type QueueStats = { checked: number; ok: number; priceUp: number; expired: number; unverifiable: number; failed: number; reasons: string[] };

/** Fila: confere as ofertas cuja hora chegou (novas, clicadas, denunciadas primeiro pela hora marcada). */
export async function runCheckQueue(limit = 20): Promise<QueueStats> {
  const s: QueueStats = { checked: 0, ok: 0, priceUp: 0, expired: 0, unverifiable: 0, failed: 0, reasons: [] };
  const why = (m: string) => {
    if (s.reasons.length < 8 && !s.reasons.includes(m)) s.reasons.push(m.slice(0, 160));
  };
  const { data, error } = await db().from("deals").select("id").eq("status", "published")
    .lte("next_check_at", new Date().toISOString()).order("next_check_at").limit(limit);
  if (error) throw error;
  for (const { id } of (data ?? []) as { id: string }[]) {
    try {
      const r = await checkDeal(id);
      if (r.outcome === "skipped") continue;
      s.checked++;
      if (r.outcome === "ok") s.ok++;
      else if (r.outcome === "price_up" && r.detail.startsWith("encerrada")) s.expired++;
      else if (r.outcome === "price_up") s.priceUp++;
      else if (r.outcome === "ended") s.expired++;
      else if (r.outcome === "unverifiable") {
        s.unverifiable++;
        why(r.detail);
      } else {
        s.failed++;
        why(r.detail);
      }
    } catch (e) {
      s.failed++;
      why(msg(e));
      // Erro inesperado: não trava a fila nesta oferta.
      await db().from("deals").update({ next_check_at: new Date(Date.now() + 30 * 60_000).toISOString() }).eq("id", id);
    }
  }
  return s;
}

/** Pede uma conferência já (clique, denúncia, "não funcionou"), se a última tiver mais de maxAgeMin minutos. Nunca lança. */
export async function requestCheck(dealId: string, maxAgeMin = 30): Promise<void> {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - maxAgeMin * 60_000).toISOString();
    await db().from("deals").update({ next_check_at: now.toISOString() })
      .eq("id", dealId).eq("status", "published").gt("next_check_at", now.toISOString())
      .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`);
  } catch (e) {
    console.error("[conferência] pedido", msg(e));
  }
}

/** Antes de mandar para um canal: confere se a última conferência tem mais de 15 min. false = não enviar. */
export async function freshEnoughToSend(dealId: string, lastCheckedAt: string | null): Promise<{ send: boolean; reason?: string }> {
  if (lastCheckedAt && Date.now() - new Date(lastCheckedAt).getTime() < 15 * 60_000) return { send: true };
  try {
    const r = await checkDeal(dealId);
    if (r.outcome === "ended" || r.outcome === "price_up") return { send: false, reason: `Conferência antes do envio: ${r.detail}` };
    return { send: true }; // ok, loja que não deixa conferir ou limite da API: segue (o selo na página diz a verdade)
  } catch (e) {
    console.error("[conferência] antes do envio", msg(e));
    return { send: true };
  }
}

export type WatchStats = { checked: number; saved: number; failed: number; reasons: string[] };

/** Acompanha o preço dos produtos que já tiveram oferta (2x por dia), mesmo depois que a oferta acaba. */
export async function runWatch(limit = 40): Promise<WatchStats> {
  const s: WatchStats = { checked: 0, saved: 0, failed: 0, reasons: [] };
  const nowIso = new Date().toISOString();
  const cutoff = new Date(Date.now() - 11 * 3600_000).toISOString();
  const { data, error } = await db().from("listings").select("id, checked_at").gt("tracked_until", nowIso)
    .or(`checked_at.is.null,checked_at.lt.${cutoff}`).order("checked_at", { ascending: true, nullsFirst: true }).limit(limit);
  if (error) throw error;
  const listings = (data ?? []) as { id: string }[];
  if (listings.length === 0) return s;
  const deals = await db().from("deals").select("listing_id, title, price_cents, url_submitted, url_resolved, created_at")
    .in("listing_id", listings.map((l) => l.id)).not("price_cents", "is", null).order("created_at", { ascending: false });
  const latest = new Map<string, { title: string; price_cents: number; url: string | null }>();
  for (const r of (deals.data ?? []) as { listing_id: string; title: string; price_cents: number; url_submitted: string | null; url_resolved: string | null }[]) {
    if (!latest.has(r.listing_id)) latest.set(r.listing_id, { title: r.title, price_cents: r.price_cents, url: r.url_resolved ?? r.url_submitted });
  }
  for (const l of listings) {
    const d = latest.get(l.id);
    if (!d?.url) {
      await db().from("listings").update({ tracked_until: null }).eq("id", l.id); // sem link para conferir
      continue;
    }
    s.checked++;
    const read = await readStorePrice(d.url, { title: d.title, dealCents: d.price_cents });
    if (read.cents != null) {
      const ins = await db().from("price_snapshots").insert({ listing_id: l.id, price_cents: read.cents, source: "watch" });
      if (!ins.error) {
        await db().from("listings").update({ last_price_cents: read.cents, in_stock: true, checked_at: new Date().toISOString() }).eq("id", l.id);
        s.saved++;
        continue;
      }
    }
    s.failed++;
    if (s.reasons.length < 8 && !s.reasons.includes(read.detail)) s.reasons.push(read.detail.slice(0, 160));
    await db().from("listings").update({ checked_at: new Date().toISOString(), ...(read.ended ? { in_stock: false } : {}) }).eq("id", l.id);
  }
  return s;
}

/** "Funcionou pra você?". Duas respostas "não" a mais que "sim" nas últimas 24 h pedem conferência já. */
export async function recordFeedback(dealId: string, voterHash: string, worked: boolean): Promise<boolean> {
  const d = await db().from("deals").select("status").eq("id", dealId).maybeSingle();
  if ((d.data as { status: string } | null)?.status !== "published") return false;
  const { error } = await db().from("deal_feedback").upsert(
    { deal_id: dealId, voter_hash: voterHash, worked, created_at: new Date().toISOString() },
    { onConflict: "deal_id,voter_hash" },
  );
  if (error) throw error;
  if (!worked) {
    const f = await feedbackCounts(dealId);
    await requestCheck(dealId, f.failed >= 2 && f.failed > f.worked ? 5 : 30);
  }
  return true;
}

async function feedbackCounts(dealId: string): Promise<{ worked: number; failed: number }> {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { data } = await db().from("deal_feedback").select("worked").eq("deal_id", dealId).gte("created_at", since);
  const rows = (data ?? []) as { worked: boolean }[];
  return { worked: rows.filter((r) => r.worked).length, failed: rows.filter((r) => !r.worked).length };
}

export type DealCheckInfo = { state: CheckState | null; lastCheckedAt: string | null; worked: number; failed: number };

/** Para a página da oferta: a última conferência e as respostas das últimas 24 h. null antes da migração 11. */
export async function getDealCheckInfo(dealId: string): Promise<DealCheckInfo | null> {
  const { data, error } = await db().from("deals").select("check_state, last_checked_at").eq("id", dealId).maybeSingle();
  if (error || !data) return null;
  const row = data as { check_state: CheckState | null; last_checked_at: string | null };
  const f = await feedbackCounts(dealId);
  return { state: row.check_state, lastCheckedAt: row.last_checked_at, ...f };
}

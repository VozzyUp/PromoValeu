// Fila de envio para Telegram e WhatsApp: escolhe as ofertas de cada canal, respeita horário e limite por hora, e envia uma por vez.
import "server-only";
import { getIntegrationConfig } from "../data/integrations";
import { sendImage, type UazapiConfig, sendText } from "../integrations/uazapi";
import { sendMessage, sendPhoto } from "../integrations/telegram";
import { db } from "../supabase/db";
import { supabaseAdmin } from "../supabase/server";
import { dealMeetsChannel, inSendWindow, renderMessage, type DispatchDeal } from "./format";

export type Channel = {
  id: string; name: string; type: "telegram" | "whatsapp"; target: string; active: boolean; min_verdict: "any" | "verified" | "good_price";
  min_discount_bp: number; window_start: string; window_end: string; max_per_hour: number; template: string; link_mode: "site" | "direct";
};

type DealRow = {
  id: string; slug: string; code: string; title: string; price_cents: number | null; list_price_cents: number | null; coupon_code: string | null;
  coupon_percent: number | null; verdict: string; real_discount_bp: number | null; image_path: string | null; status: string;
  store: { name: string } | null;
};

const DEAL_COLS = "id, slug, code, title, price_cents, list_price_cents, coupon_code, coupon_percent, verdict, real_discount_bp, image_path, status, store:stores(name)";
const FRESH_HOURS = 6;
const MAX_ATTEMPTS = 3;

const toDispatchDeal = (r: DealRow): DispatchDeal => ({
  title: r.title, slug: r.slug, code: r.code, storeName: r.store?.name ?? "", priceCents: r.price_cents, listPriceCents: r.list_price_cents,
  couponCode: r.coupon_code, couponPercent: r.coupon_percent, verdict: r.verdict, realDiscountBp: r.real_discount_bp,
});

export function dealLink(channel: Pick<Channel, "link_mode" | "type">, d: Pick<DispatchDeal, "slug" | "code">): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return channel.link_mode === "direct" ? `${base}/ir/${d.code}?c=${channel.type}` : `${base}/oferta/${d.slug}`;
}

function imageOf(path: string | null): string | null {
  return path ? supabaseAdmin().storage.from("deal-images").getPublicUrl(path).data.publicUrl : null;
}

/** Envia uma oferta a um canal. Devolve o id da mensagem. */
export async function deliver(channel: Channel, row: DealRow): Promise<string> {
  const d = toDispatchDeal(row);
  const text = renderMessage(channel.template, d, dealLink(channel, d), channel.type);
  const image = imageOf(row.image_path);
  if (channel.type === "telegram") {
    const cfg = await getIntegrationConfig<{ botToken: string }>("telegram");
    if (!cfg) throw new Error("Integração do Telegram desligada ou incompleta.");
    return image && text.length <= 1000 ? sendPhoto(cfg.botToken, channel.target, image, text) : sendMessage(cfg.botToken, channel.target, text);
  }
  const cfg = await getIntegrationConfig<UazapiConfig>("uazapi");
  if (!cfg) throw new Error("Integração do WhatsApp desligada ou incompleta.");
  if (!image) return sendText(cfg, channel.target, text);
  try {
    return await sendImage(cfg, channel.target, image, text);
  } catch (e) {
    // Canal (newsletter) pode recusar foto por link: manda só o texto, que já leva o link da oferta.
    if (channel.target.endsWith("@newsletter")) return sendText(cfg, channel.target, text);
    throw e;
  }
}

export type DispatchStats = { enqueued: number; sent: number; failed: number; skipped: number };

export async function runDispatch(now = new Date()): Promise<DispatchStats> {
  const stats: DispatchStats = { enqueued: 0, sent: 0, failed: 0, skipped: 0 };
  const chans = await db().from("channels").select("*").eq("active", true);
  if (chans.error) throw chans.error;

  for (const ch of chans.data as Channel[]) {
    // 1) entra na fila quem é novo e cumpre as regras do canal
    const fresh = await db().from("deals").select(DEAL_COLS).eq("status", "published")
      .gte("published_at", new Date(now.getTime() - FRESH_HOURS * 3600_000).toISOString()).order("published_at").limit(100);
    const deals = (fresh.data ?? []) as unknown as DealRow[];
    const eligible = deals.filter((r) => dealMeetsChannel(toDispatchDeal(r), ch));
    if (eligible.length) {
      const have = await db().from("dispatches").select("deal_id").eq("channel_id", ch.id).in("deal_id", eligible.map((r) => r.id));
      const haveSet = new Set(((have.data ?? []) as { deal_id: string }[]).map((r) => r.deal_id));
      const rows = eligible.filter((r) => !haveSet.has(r.id)).map((r) => ({ deal_id: r.id, channel_id: ch.id }));
      if (rows.length) {
        const ins = await db().from("dispatches").upsert(rows, { onConflict: "deal_id,channel_id", ignoreDuplicates: true });
        if (!ins.error) stats.enqueued += rows.length;
      }
    }

    // 2) envia no máximo uma por rodada, dentro do horário e do limite por hora
    if (!inSendWindow(now, ch.window_start, ch.window_end)) continue;
    const lastHour = await db().from("dispatches").select("id", { count: "exact", head: true })
      .eq("channel_id", ch.id).eq("status", "sent").gte("sent_at", new Date(now.getTime() - 3600_000).toISOString());
    if ((lastHour.count ?? 0) >= ch.max_per_hour) continue;

    const next = await db().from("dispatches").select(`id, attempts, deal:deals(${DEAL_COLS})`)
      .eq("channel_id", ch.id).eq("status", "queued").lte("next_attempt_at", now.toISOString()).order("created_at").limit(1).maybeSingle();
    const disp = next.data as unknown as { id: string; attempts: number; deal: DealRow | null } | null;
    if (!disp) continue;
    if (!disp.deal || disp.deal.status !== "published") {
      await db().from("dispatches").update({ status: "skipped", error: "A oferta não está mais no ar." }).eq("id", disp.id);
      stats.skipped++;
      continue;
    }
    try {
      const messageId = await deliver(ch, disp.deal);
      await db().from("dispatches").update({ status: "sent", sent_at: new Date().toISOString(), external_message_id: messageId, attempts: disp.attempts + 1, error: null }).eq("id", disp.id);
      stats.sent++;
    } catch (e) {
      const attempts = disp.attempts + 1;
      await db().from("dispatches").update({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "queued", attempts, error: (e instanceof Error ? e.message : "falha").slice(0, 300),
        next_attempt_at: new Date(now.getTime() + attempts * 5 * 60_000).toISOString(),
      }).eq("id", disp.id);
      stats.failed++;
    }
  }
  return stats;
}

/** Mensagem de teste com a oferta mais recente no ar (ou um texto simples se não houver). */
export async function sendTest(channelId: string): Promise<string> {
  const { data, error } = await db().from("channels").select("*").eq("id", channelId).maybeSingle();
  if (error) throw error;
  const ch = data as Channel | null;
  if (!ch) throw new Error("Canal não encontrado.");
  const deal = await db().from("deals").select(DEAL_COLS).eq("status", "published").order("published_at", { ascending: false }).limit(1).maybeSingle();
  const row = deal.data as unknown as DealRow | null;
  if (row) return deliver(ch, row);
  const demo: DealRow = {
    id: "demo", slug: "teste", code: "teste", title: "Mensagem de teste do PromoValeu", price_cents: 9990, list_price_cents: 14990, coupon_code: null,
    coupon_percent: null, verdict: "no_comparison", real_discount_bp: null, image_path: null, status: "published", store: { name: "Loja de teste" },
  };
  return deliver(ch, demo);
}

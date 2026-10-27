// Cliente mínimo da API do Mercado Livre: autorização (OAuth com PKCE), renovação da chave e preço de um produto.
import "server-only";
import type { MlRef } from "../ml-url";

const API = "https://api.mercadolibre.com";
const AUTH = "https://auth.mercadolivre.com.br/authorization";

/** Endereço de retorno cadastrado no app do Mercado Livre (precisa ser idêntico). */
export function mlRedirectUri(): string {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.promovaleu.com.br").replace(/\/$/, "")}/api/mercadolivre/retorno`;
}

export type MlTokens ={ access_token: string; refresh_token: string; expires_in: number; user_id?: number };

export function authorizeUrl(o: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    response_type: "code", client_id: o.clientId, redirect_uri: o.redirectUri, state: o.state,
    code_challenge: o.challenge, code_challenge_method: "S256",
  });
  return `${AUTH}?${q}`;
}

async function tokenCall(body: Record<string, string>): Promise<MlTokens> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as (MlTokens & { message?: string; error?: string }) | null;
  if (!res.ok || !json?.access_token) throw new Error(`Mercado Livre recusou: ${json?.message ?? json?.error ?? res.status}`);
  return json;
}

export const exchangeCode = (o: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string }) =>
  tokenCall({ grant_type: "authorization_code", client_id: o.clientId, client_secret: o.clientSecret, code: o.code, redirect_uri: o.redirectUri, code_verifier: o.verifier });

export const refreshTokens = (o: { clientId: string; clientSecret: string; refreshToken: string }) =>
  tokenCall({ grant_type: "refresh_token", client_id: o.clientId, client_secret: o.clientSecret, refresh_token: o.refreshToken });

export async function mlGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !json) throw new Error(`Mercado Livre respondeu ${res.status}${json?.message ? `: ${json.message}` : ""}`);
  return json;
}

const toCents = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v * 100) : null);

type Item = { price?: number; status?: string };

/** Preço em centavos e se o anúncio ainda está à venda. */
export type MlQuote = { cents: number | null; active: boolean };

async function itemQuote(token: string, id: string): Promise<MlQuote> {
  const it = await mlGet<Item>(token, `/items/${id}?attributes=price,status`);
  const active = !it.status || it.status === "active";
  if (!active) return { cents: null, active: false }; // pausado ou encerrado
  // /sale_price é o preço que o comprador vê (com promoção); o price de /items é a reserva.
  try {
    const sp = await mlGet<{ amount?: number }>(token, `/items/${id}/sale_price?context=channel_marketplace`);
    const c = toCents(sp.amount);
    if (c) return { cents: c, active };
  } catch {
    // fica com o price de /items
  }
  return { cents: toCents(it.price), active };
}

export async function mlQuote(token: string, ref: MlRef): Promise<MlQuote> {
  if (ref.kind === "item") return itemQuote(token, ref.id);
  if (ref.kind === "product") {
    const p = await mlGet<{ status?: string; buy_box_winner?: { price?: number; item_id?: string } | null }>(token, `/products/${ref.id}`);
    const win = p.buy_box_winner;
    if (!win) return { cents: null, active: false }; // catálogo sem ninguém vendendo
    const direct = toCents(win.price);
    return direct ? { cents: direct, active: true } : win.item_id ? itemQuote(token, win.item_id) : { cents: null, active: true };
  }
  // Produto do vendedor: acha um anúncio dele e usa o preço do anúncio.
  const up = await mlGet<{ user_id?: number; seller_id?: number }>(token, `/user-products/${ref.id}`);
  const seller = up.user_id ?? up.seller_id;
  if (!seller) return { cents: null, active: true };
  const s = await mlGet<{ results?: string[] }>(token, `/users/${seller}/items/search?user_product_id=${ref.id}`);
  const first = s.results?.[0];
  return first ? itemQuote(token, first) : { cents: null, active: true };
}

/** Preço atual em centavos, ou null se não deu para saber. */
export async function mlPriceCents(token: string, ref: MlRef): Promise<number | null> {
  return (await mlQuote(token, ref)).cents;
}

export type MlCatalogHit = { id: string; name: string; gtin: string | null };

/** Busca no catálogo do Mercado Livre por código de barras ou por nome. */
export async function mlSearchCatalog(token: string, o: { gtin?: string | null; title?: string }): Promise<MlCatalogHit[]> {
  const q = new URLSearchParams({ status: "active", site_id: "MLB", limit: "5" });
  if (o.gtin) q.set("product_identifier", o.gtin);
  else if (o.title) q.set("q", o.title.slice(0, 100));
  else return [];
  type R = { results?: { id: string; name: string; attributes?: { id: string; value_name?: string | null }[] }[] };
  const r = await mlGet<R>(token, `/products/search?${q}`);
  return (r.results ?? []).map((x) => ({
    id: x.id, name: x.name, gtin: x.attributes?.find((a) => a.id === "GTIN")?.value_name?.split(",")[0]?.trim() ?? null,
  }));
}

export const mlMe = (token: string) => mlGet<{ id: number; nickname?: string }>(token, "/users/me");

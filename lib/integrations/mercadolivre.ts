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

async function itemPrice(token: string, id: string): Promise<number | null> {
  // /sale_price é o preço que o comprador vê (com promoção); /items é a reserva.
  try {
    const sp = await mlGet<{ amount?: number }>(token, `/items/${id}/sale_price?context=channel_marketplace`);
    const c = toCents(sp.amount);
    if (c) return c;
  } catch {
    // segue para /items
  }
  const it = await mlGet<Item>(token, `/items/${id}?attributes=price,status`);
  if (it.status && it.status !== "active") return null; // anúncio pausado ou encerrado
  return toCents(it.price);
}

/** Preço atual em centavos, ou null se não deu para saber. */
export async function mlPriceCents(token: string, ref: MlRef): Promise<number | null> {
  if (ref.kind === "item") return itemPrice(token, ref.id);
  if (ref.kind === "product") {
    const p = await mlGet<{ buy_box_winner?: { price?: number; item_id?: string } | null }>(token, `/products/${ref.id}`);
    return toCents(p.buy_box_winner?.price) ?? (p.buy_box_winner?.item_id ? itemPrice(token, p.buy_box_winner.item_id) : null);
  }
  // Produto do vendedor: acha um anúncio dele e usa o preço do anúncio.
  const up = await mlGet<{ user_id?: number; seller_id?: number }>(token, `/user-products/${ref.id}`);
  const seller = up.user_id ?? up.seller_id;
  if (!seller) return null;
  const s = await mlGet<{ results?: string[] }>(token, `/users/${seller}/items/search?user_product_id=${ref.id}`);
  const first = s.results?.[0];
  return first ? itemPrice(token, first) : null;
}

export const mlMe = (token: string) => mlGet<{ id: number; nickname?: string }>(token, "/users/me");

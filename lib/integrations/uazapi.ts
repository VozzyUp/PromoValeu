// Cliente mínimo da UAZAPI (WhatsApp).
import "server-only";

export type UazapiConfig = { baseUrl: string; token: string };

async function call<T>(cfg: UazapiConfig, path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}${path}`, {
    method: body ? "POST" : "GET",
    headers: { token: cfg.token, "Content-Type": "application/json; charset=utf-8" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(`UAZAPI respondeu ${res.status}${json?.error ? `: ${json.error}` : ""}`);
  return json;
}

export const instanceStatus = (cfg: UazapiConfig) => call<{ status?: string; instance?: { status?: string } }>(cfg, "/instance/status");

export async function sendText(cfg: UazapiConfig, number: string, text: string): Promise<string> {
  const r = await call<{ messageid?: string }>(cfg, "/send/text", { number, text });
  return r.messageid ?? "";
}

export async function sendImage(cfg: UazapiConfig, number: string, imageUrl: string, caption: string): Promise<string> {
  const r = await call<{ messageid?: string }>(cfg, "/send/media", { number, type: "image", file: imageUrl, text: caption });
  return r.messageid ?? "";
}
/* ------------------------------------------------- leitura (fontes de ofertas) */

/** Posts recentes de um canal (newsletter), direto do WhatsApp. */
export async function newsletterMessages(cfg: UazapiConfig, jid: string, count = 40): Promise<unknown[]> {
  const r = await call<{ response?: unknown[] }>(cfg, "/newsletter/messages", { jid, count });
  return Array.isArray(r.response) ? r.response : [];
}

/** Informações do canal a partir da chave do link de convite. */
export const newsletterByInvite = (cfg: UazapiConfig, key: string) => call<unknown>(cfg, "/newsletter/link", { key });

/** Faz a conta seguir o canal (necessário para ler os posts em algumas versões). */
export const newsletterFollow = (cfg: UazapiConfig, jid: string) => call<unknown>(cfg, "/newsletter/follow", { jid });

/** Grupos em que o número conectado participa. */
export async function listGroups(cfg: UazapiConfig): Promise<{ jid: string; name: string }[]> {
  const r = await call<{ groups?: { JID?: string; Name?: string }[] }>(cfg, "/group/list", { limit: 500, noParticipants: true });
  return (r.groups ?? []).filter((g) => g.JID).map((g) => ({ jid: g.JID as string, name: (g.Name || g.JID) as string }));
}

/** Mensagens recentes de uma conversa, as mais novas primeiro. */
export async function findMessages(cfg: UazapiConfig, chatid: string, limit = 60): Promise<unknown[]> {
  const r = await call<{ messages?: unknown[] }>(cfg, "/message/find", { chatid, limit, offset: 0 });
  return Array.isArray(r.messages) ? r.messages : [];
}

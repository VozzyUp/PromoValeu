// Mensagens de canais e grupos do WhatsApp (pela UAZAPI) no mesmo formato das publicações do Telegram.
// Funções puras, testadas em tests/sources-whatsapp.test.ts.
import type { RawPost } from "./types";

/** Post de canal como /newsletter/messages devolve. */
export type ChannelItem = { serverid?: number; timestamp?: string; message?: Record<string, unknown> | null };
/** Mensagem de grupo como /message/find devolve. */
export type GroupMessage = { messageTimestamp?: number; text?: string | null; fromMe?: boolean; messageType?: string; content?: unknown };

const URL_RE = /https?:\/\/[^\s<>"'*~]+/gi;
const CHAT_HOSTS = /^https?:\/\/(www\.)?(wa\.me|chat\.whatsapp\.com|whatsapp\.com|api\.whatsapp\.com|t\.me|telegram\.me)\//i;

/** Texto da mensagem bruta do WhatsApp: texto simples, texto com prévia de link ou legenda de foto/vídeo. */
export function messageText(m: Record<string, unknown> | null | undefined): string {
  if (!m) return "";
  const pick = (o: unknown, k: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined);
  for (const v of [
    m.conversation,
    pick(m.extendedTextMessage, "text"),
    pick(m.imageMessage, "caption"),
    pick(m.videoMessage, "caption"),
    pick(m.documentMessage, "caption"),
  ]) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/** Tira a formatação do WhatsApp (*negrito*, ~riscado~, _itálico_) e guarda os trechos em negrito e riscados. */
export function stripFormatting(raw: string): { text: string; bold: string[]; strike: string[] } {
  const bold: string[] = [];
  const strike: string[] = [];
  const text = raw
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?:;)])/gm, (_m, pre: string, inner: string) => {
      bold.push(inner.trim());
      return pre + inner;
    })
    .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s.,!?:;)])/gm, (_m, pre: string, inner: string) => {
      strike.push(inner.trim());
      return pre + inner;
    })
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,!?:;)])/gm, (_m, pre: string, inner: string) => pre + inner);
  return { text, bold, strike };
}

/** Links na ordem em que aparecem, sem pontuação colada no fim e sem links de conversa (WhatsApp, Telegram). */
export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,!?:;)\]]+$/, "");
    if (CHAT_HOSTS.test(url) || out.includes(url)) continue;
    out.push(url);
  }
  return out;
}

function toPost(id: number, postedAt: Date | null, raw: string): RawPost {
  const { text, bold, strike } = stripFormatting(raw);
  return { id, postedAt, text, links: extractLinks(text), bold, strike, imageUrl: null, postUrl: null };
}

/** Posts de canal, do mais antigo para o mais novo. O número do post (serverid) cresce sempre. */
export function channelPosts(items: ChannelItem[]): RawPost[] {
  const out: RawPost[] = [];
  for (const it of items) {
    if (!Number.isInteger(it.serverid) || (it.serverid ?? 0) <= 0) continue;
    const raw = messageText(it.message ?? null);
    if (!raw) continue;
    const at = it.timestamp ? new Date(it.timestamp) : null;
    out.push(toPost(it.serverid as number, at && !Number.isNaN(at.getTime()) ? at : null, raw));
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Mensagens de grupo, do mais antigo para o mais novo. O número é o horário em milissegundos. */
export function groupPosts(messages: GroupMessage[]): RawPost[] {
  const out: RawPost[] = [];
  for (const m of messages) {
    if (m.fromMe || !Number.isInteger(m.messageTimestamp) || (m.messageTimestamp ?? 0) <= 0) continue;
    const raw = typeof m.text === "string" && m.text.trim() ? m.text : "";
    if (!raw) continue;
    out.push(toPost(m.messageTimestamp as number, new Date(m.messageTimestamp as number), raw));
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Chave do convite em "https://whatsapp.com/channel/0029Va..." (também no meio de um texto, ou a própria chave). */
export function channelInviteKey(input: string): string | null {
  const s = input.trim();
  const m = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{10,})/i.exec(s); // o link pode vir no meio do texto de compartilhar
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{16,40}$/.test(s) && /[A-Za-z]/.test(s) ? s : null;
}

/** JID de canal ("120363...@newsletter") digitado direto. */
export function channelJid(input: string): string | null {
  const m = /^(\d{10,25})(@newsletter)?$/.exec(input.trim());
  return m ? `${m[1]}@newsletter` : null;
}

/** Procura o JID do canal e o nome em qualquer formato de resposta de /newsletter/link ou /newsletter/info. */
export function readChannelInfo(resp: unknown): { jid: string | null; name: string | null } {
  let jid: string | null = null;
  let name: string | null = null;
  const walk = (v: unknown, key: string, depth: number) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") {
      if (!jid && /^\d{10,25}@newsletter$/.test(v)) jid = v;
      return;
    }
    if (typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    // whatsmeow: ThreadMeta.Name.Text; outras versões: name
    if (!name && /^name$/i.test(key) && typeof o.Text === "string" && o.Text.trim()) name = o.Text;
    if (!name && typeof o.name === "string" && o.name.trim()) name = o.name;
    for (const [k, child] of Object.entries(o)) walk(child, k, depth + 1);
  };
  walk(resp, "", 0);
  return { jid, name: name ? String(name).slice(0, 120) : null };
}

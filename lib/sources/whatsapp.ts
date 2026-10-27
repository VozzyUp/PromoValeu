// Leitura de canais e grupos do WhatsApp pela UAZAPI (o mesmo número que envia para os nossos canais).
import "server-only";
import { getIntegrationConfig } from "../data/integrations";
import {
  findMessages, listGroups, newsletterByInvite, newsletterFollow, newsletterMessages, type UazapiConfig,
} from "../integrations/uazapi";
import type { RawPost } from "./types";
import {
  channelInviteKey, channelJid, channelPosts, groupPosts, readChannelInfo, type ChannelItem, type GroupMessage,
} from "./whatsapp-parse";

export type WhatsappKind = "whatsapp_channel" | "whatsapp_group";

export async function uazapiConfig(): Promise<UazapiConfig> {
  const cfg = await getIntegrationConfig<UazapiConfig>("uazapi");
  if (!cfg?.baseUrl || !cfg?.token) throw new Error("Ligue a integração do WhatsApp (UAZAPI) em Painel > Integrações.");
  return cfg;
}

/** Publicações recentes, da mais antiga para a mais nova. */
export async function readWhatsappPosts(kind: WhatsappKind, target: string): Promise<RawPost[]> {
  const cfg = await uazapiConfig();
  if (kind === "whatsapp_group") {
    return groupPosts((await findMessages(cfg, target, 60)) as GroupMessage[]);
  }
  let items = (await newsletterMessages(cfg, target, 40).catch(() => [])) as ChannelItem[];
  if (items.length === 0) {
    // Algumas versões só devolvem posts de canais seguidos.
    await newsletterFollow(cfg, target).catch(() => null);
    items = (await newsletterMessages(cfg, target, 40)) as ChannelItem[];
  }
  return channelPosts(items);
}

/** Canal a partir do link de convite (ou do JID). Segue o canal para garantir a leitura. */
export async function resolveChannel(input: string): Promise<{ jid: string; name: string | null }> {
  const cfg = await uazapiConfig();
  const direct = channelJid(input);
  let jid = direct;
  let name: string | null = null;
  if (!jid) {
    const key = channelInviteKey(input);
    if (!key) throw new Error("Cole o link do canal (https://whatsapp.com/channel/...).");
    const info = readChannelInfo(await newsletterByInvite(cfg, key));
    if (!info.jid) throw new Error("Não achei esse canal. Confira o link.");
    jid = info.jid;
    name = info.name;
  }
  await newsletterFollow(cfg, jid).catch(() => null);
  return { jid, name };
}

export async function whatsappGroups(): Promise<{ jid: string; name: string }[]> {
  const groups = await listGroups(await uazapiConfig());
  return groups.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { parsePriceToCents } from "@/lib/format";
import { isValidCron } from "@/lib/jobs/cron";
import { channelLabel, normalizeChannel } from "@/lib/sources/parse-web";
import { listAccountChats, logoutAccount, startLogin, submitCode, submitPassword, type AccountChat } from "@/lib/sources/telegram-account";
import { fetchPublicChannel, type PublicChannel } from "@/lib/sources/telegram-web";
import { db } from "@/lib/supabase/db";
import { resolveChannel, whatsappGroups } from "@/lib/sources/whatsapp";

export type SourceState = { ok?: boolean; error?: string } | undefined;
export type LoginState = { ok?: boolean; error?: string; step?: "code" | "password" | "done" } | undefined;
export type ChatsState = { chats?: AccountChat[]; error?: string } | undefined;
export type GroupsState = { groups?: { jid: string; name: string }[]; error?: string } | undefined;

const UUID = /^[0-9a-f-]{36}$/i;
const ACCOUNT_TARGET = /^(channel:\d+:-?\d+|chat:\d+)$/;

/** Cria ou atualiza uma fonte. Sem id = nova. */
export async function saveSourceAction(_prev: SourceState, form: FormData): Promise<SourceState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const isNew = !UUID.test(id);
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) return { error: "Dê um nome de 2 a 60 caracteres." };
  const cron = String(form.get("cron") ?? "").trim();
  if (!isValidCron(cron)) return { error: "Frequência inválida." };
  const num = (k: string, min: number, max: number) => {
    const v = Number(String(form.get(k) ?? "0").replace(",", ".") || "0");
    return Number.isFinite(v) && v >= min && v <= max ? v : null;
  };
  const minDiscount = num("minDiscountPct", 0, 95);
  const perRun = num("perRun", 1, 50);
  if (minDiscount == null || perRun == null) return { error: "Confira os números: desconto de 0 a 95 e de 1 a 50 ofertas por rodada." };
  const maxPriceRaw = String(form.get("maxPrice") ?? "").trim();
  const maxPrice = maxPriceRaw ? parsePriceToCents(maxPriceRaw) : null;
  if (maxPriceRaw && maxPrice == null) return { error: "Preço máximo inválido." };
  const blockWords = [...new Set(String(form.get("blockWords") ?? "").split(/[\n,;]+/).map((w) => w.trim().toLowerCase()).filter(Boolean))].slice(0, 50);
  const cat = String(form.get("categoryId") ?? "");

  const row: Record<string, unknown> = {
    name, cron, active: form.get("active") === "on", auto_publish: form.get("autoPublish") === "on", take_coupons: form.get("takeCoupons") === "on",
    min_discount_bp: Math.round(minDiscount * 100), max_price_cents: maxPrice, per_run: Math.round(perRun), block_words: blockWords,
    category_id: UUID.test(cat) ? cat : null,
  };

  if (isNew) {
    const kind = String(form.get("kind") ?? "");
    if (kind === "telegram_public") {
      const channel = normalizeChannel(String(form.get("channel") ?? ""));
      if (!channel) return { error: "Informe o canal como @nome ou t.me/nome. Link de convite (t.me/+...) é de grupo privado: use a conta logada." };
      let page: PublicChannel;
      try {
        page = await fetchPublicChannel(channel); // confere já se o canal abre sem login
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Não consegui abrir o canal." };
      }
      // Guarda o nome principal (o @ digitado pode ser só um apelido) e o título, para a lista mostrar qual canal é.
      Object.assign(row, { kind, target: page.name, target_title: channelLabel(page) });
    } else if (kind === "telegram_account") {
      const [target, title] = String(form.get("chat") ?? "").split("::");
      if (!ACCOUNT_TARGET.test(target ?? "")) return { error: "Escolha o grupo ou canal na lista da conta." };
      Object.assign(row, { kind, target, target_title: decodeURIComponent(title ?? "").slice(0, 120) || null });
    } else if (kind === "whatsapp_channel") {
      try {
        const ch = await resolveChannel(String(form.get("waChannel") ?? ""));
        Object.assign(row, { kind, target: ch.jid, target_title: ch.name });
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Não consegui abrir o canal." };
      }
    } else if (kind === "whatsapp_group") {
      const [target, title] = String(form.get("waGroup") ?? "").split("::");
      if (!/^[\d-]+@g\.us$/.test(target ?? "")) return { error: "Escolha o grupo na lista." };
      Object.assign(row, { kind, target, target_title: decodeURIComponent(title ?? "").slice(0, 120) || null });
    } else {
      return { error: "Escolha o tipo da fonte." };
    }
  }

  const q = isNew ? db().from("sources").insert(row) : db().from("sources").update(row).eq("id", id);
  const { error } = await q;
  if (error) return { error: error.code === "23505" ? "Essa fonte já está cadastrada." : error.code === "42P01" ? "Rode a migração 8 no Supabase antes." : error.code === "23514" ? "Rode a migração 10 no Supabase antes (libera as fontes do WhatsApp)." : error.message };
  revalidatePath("/painel/fontes");
  return { ok: true };
}

export async function deleteSourceAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (UUID.test(id)) await db().from("sources").delete().eq("id", id);
  revalidatePath("/painel/fontes");
}

/* ------------------------------------------------------------- conta do Telegram */

export async function telegramStartAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  await requireAdmin();
  const apiId = String(form.get("apiId") ?? "").trim();
  const apiHash = String(form.get("apiHash") ?? "").trim().toLowerCase();
  const phone = String(form.get("phone") ?? "").replace(/[^\d+]/g, "");
  if (!/^\d{3,12}$/.test(apiId)) return { error: "O api_id é um número (veja em my.telegram.org)." };
  if (!/^[0-9a-f]{32}$/.test(apiHash)) return { error: "O api_hash tem 32 letras e números (veja em my.telegram.org)." };
  if (!/^\+?\d{10,15}$/.test(phone)) return { error: "Telefone com DDI e DDD, por exemplo +5511999998888." };
  try {
    await startLogin(apiId, apiHash, phone.startsWith("+") ? phone : `+${phone}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao pedir o código." };
  }
  revalidatePath("/painel/fontes");
  return { step: "code" };
}

export async function telegramCodeAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  await requireAdmin();
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (code.length < 4) return { error: "Digite o código que chegou no Telegram." };
  try {
    const r = await submitCode(code);
    revalidatePath("/painel/fontes");
    return { step: r.needsPassword ? "password" : "done" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao entrar." };
  }
}

export async function telegramPasswordAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  await requireAdmin();
  const password = String(form.get("password") ?? "");
  if (!password) return { error: "Digite a senha de duas etapas." };
  try {
    await submitPassword(password);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao entrar." };
  }
  revalidatePath("/painel/fontes");
  return { step: "done" };
}

export async function telegramLogoutAction() {
  await requireAdmin();
  await logoutAccount();
  revalidatePath("/painel/fontes");
}

export async function loadChatsAction(): Promise<ChatsState> {
  await requireAdmin();
  try {
    return { chats: await listAccountChats() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não consegui listar os grupos." };
  }
}

/** Grupos do WhatsApp em que o número da UAZAPI participa. */
export async function loadWhatsappGroupsAction(): Promise<GroupsState> {
  await requireAdmin();
  try {
    return { groups: await whatsappGroups() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não consegui listar os grupos." };
  }
}

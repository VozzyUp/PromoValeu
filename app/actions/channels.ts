"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { sendTest } from "@/lib/dispatch/run";
import { db } from "@/lib/supabase/db";
import { resolveChannel, resolveGroup } from "@/lib/sources/whatsapp";
import { channelInviteKey, groupInviteCode } from "@/lib/sources/whatsapp-parse";

export type ChannelState = { ok?: boolean; error?: string; message?: string } | undefined;

const UUID = /^[0-9a-f-]{36}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveChannelAction(_prev: ChannelState, form: FormData): Promise<ChannelState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) return { error: "Dê um nome de 2 a 60 caracteres." };
  const type = form.get("type") === "whatsapp" ? "whatsapp" : "telegram";
  let target = String(form.get("target") ?? "").trim().slice(0, 600);
  if (!target) return { error: type === "telegram" ? "Informe o canal, como @meucanal ou o id numérico." : "Informe o link do canal, o número ou o id do grupo." };
  // Canal do WhatsApp: o link de convite vira o id interno (1203...@newsletter).
  if (type === "whatsapp" && /whatsapp\.com\/channel\//i.test(target) && channelInviteKey(target)) {
    try {
      target = (await resolveChannel(target)).jid;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Não consegui abrir o canal." };
    }
  } else if (type === "whatsapp" && groupInviteCode(target)) {
    try {
      target = await resolveGroup(target);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Não consegui abrir o grupo." };
    }
  }
  target = target.slice(0, 120);
  const minVerdict = ["any", "verified", "good_price"].includes(String(form.get("minVerdict"))) ? String(form.get("minVerdict")) : "any";
  const discount = Number(String(form.get("minDiscountPct") ?? "").replace(",", "."));
  const perHour = Number(form.get("maxPerHour"));
  const start = String(form.get("windowStart") ?? ""), end = String(form.get("windowEnd") ?? "");
  if (!Number.isFinite(discount) || discount < 0 || discount > 95) return { error: "Desconto mínimo de 0 a 95." };
  if (!Number.isInteger(perHour) || perHour < 1 || perHour > 60) return { error: "Limite por hora de 1 a 60." };
  if (!TIME.test(start) || !TIME.test(end)) return { error: "Horários no formato 08:00." };
  const template = String(form.get("template") ?? "").trim().slice(0, 1500);
  if (!template.includes("{link}")) return { error: "O modelo da mensagem precisa ter {link}." };

  const row = {
    name, type, target, active: form.get("active") === "on", min_verdict: minVerdict, min_discount_bp: Math.round(discount * 100),
    window_start: start, window_end: end, max_per_hour: perHour, template, link_mode: form.get("linkMode") === "direct" ? "direct" : "site",
  };
  const { error } = UUID.test(id) ? await db().from("channels").update(row).eq("id", id) : await db().from("channels").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/painel/canais");
  return { ok: true };
}

export async function deleteChannelAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (UUID.test(id)) await db().from("channels").delete().eq("id", id);
  revalidatePath("/painel/canais");
}

export async function testChannelAction(_prev: ChannelState, form: FormData): Promise<ChannelState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Canal inválido." };
  try {
    const messageId = await sendTest(id);
    return { ok: true, message: `Enviado (mensagem ${messageId || "sem id"}).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 300) : "Falha no envio." };
  }
}
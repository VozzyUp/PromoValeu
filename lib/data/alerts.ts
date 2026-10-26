// Alertas de oferta por palavra-chave (Supabase). O aviso chega pelo sininho de Avisos.
import "server-only";
import { db } from "../supabase/db";

export const MAX_ALERTS = 20;

export type AlertView = {
  id: string;
  keyword: string;
  maxPriceCents: number | null;
  categoryName: string | null;
  active: boolean;
  createdAt: string;
};

type Row = {
  id: string; keyword: string; max_price_cents: number | null; active: boolean; created_at: string;
  category: { name: string } | null;
};

export async function listAlerts(userId: string): Promise<AlertView[]> {
  const { data, error } = await db()
    .from("alerts").select("id, keyword, max_price_cents, active, created_at, category:categories(name)")
    .eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Row[]).map((r) => ({
    id: r.id, keyword: r.keyword, maxPriceCents: r.max_price_cents, categoryName: r.category?.name ?? null,
    active: r.active, createdAt: r.created_at,
  }));
}

export async function createAlert(input: { userId: string; keyword: string; maxPriceCents: number | null; categoryId: string | null }) {
  const { count, error: e1 } = await db().from("alerts").select("id", { count: "exact", head: true }).eq("user_id", input.userId);
  if (e1) throw e1;
  if ((count ?? 0) >= MAX_ALERTS) return { error: `Você já tem ${MAX_ALERTS} alertas. Apague algum para criar outro.` as const };
  const { error } = await db().from("alerts").insert({
    user_id: input.userId, keyword: input.keyword, max_price_cents: input.maxPriceCents, category_id: input.categoryId, channel: "email",
  });
  if (error) throw error;
  return { ok: true as const };
}

export async function removeAlert(id: string, userId: string) {
  const { error } = await db().from("alerts").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function setAlertActive(id: string, userId: string, active: boolean) {
  const { error } = await db().from("alerts").update({ active }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

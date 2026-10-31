"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getProfile } from "@/lib/data";
import { syncBadges } from "@/lib/data/gamification";
import { requestCheck } from "@/lib/data/deal-check";
import {
  countCommentsSince, createComment, getCommentTarget, getDealSlugById, hasSameRecentComment, markDealExpired, pathForTarget,
  reactToComment, removeComment, reportComment, reportDeal, setSubscription,
} from "@/lib/data/comments";
import { extractMentions } from "@/lib/mentions";
import type { CommentReaction } from "@/lib/types";

export type CommentState = { error?: string; ok?: boolean } | undefined;

const uuid = z.string().uuid();
const commentSchema = z.object({
  dealId: z.union([uuid, z.literal("")]).optional(),
  threadId: z.union([uuid, z.literal("")]).optional(),
  parentId: z.union([uuid, z.literal("")]).optional(),
  body: z.string().trim().min(1, "Escreva alguma coisa.").max(2000, "Máximo de 2.000 caracteres."),
});

const PER_HOUR = 10;
const PER_DAY = 60;

export async function postCommentAction(_prev: CommentState, form: FormData): Promise<CommentState> {
  const session = await getSession();
  if (!session) return { error: "Entre na sua conta para comentar." };
  const parsed = commentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Comentário inválido." };
  const { body } = parsed.data;
  const dealId = parsed.data.dealId || null;
  const threadId = parsed.data.threadId || null;
  if ((dealId === null) === (threadId === null)) return { error: "Comentário inválido." };
  const parentId = parsed.data.parentId || null;

  const profile = await getProfile(session.userId);
  const trusted = !!profile?.trusted || session.role !== "user";
  if (!trusted && (body.match(/https?:\/\//gi) ?? []).length > 2) {
    return { error: "Contas novas podem colocar até 2 links por comentário." };
  }

  const now = Date.now();
  if ((await countCommentsSince(session.userId, new Date(now - 3600_000).toISOString())) >= PER_HOUR) {
    return { error: "Muitos comentários em pouco tempo. Respire e volte daqui a pouco." };
  }
  if ((await countCommentsSince(session.userId, new Date(now - 86400_000).toISOString())) >= PER_DAY) {
    return { error: "Você chegou ao limite de comentários de hoje. Volte amanhã." };
  }
  if (await hasSameRecentComment(session.userId, body, new Date(now - 600_000).toISOString())) {
    return { error: "Você já enviou exatamente esse comentário." };
  }

  try {
    await createComment({ dealId, threadId, userId: session.userId, parentId, body, mentions: extractMentions(body) });
  } catch (e) {
    console.error("[comment]", e);
    return { error: "Não foi possível enviar o comentário. Tente de novo." };
  }
  try {
    await syncBadges(session.userId); // medalhas de comentários; nunca atrapalha o comentário
  } catch (e) {
    console.error("[badges]", e);
  }
  const path = await pathForTarget({ dealId, threadId });
  if (path) revalidatePath(path);
  return { ok: true };
}

export type ReactionResult = { likes: number; helpful: number; haha: number; mine: CommentReaction | null } | { error: string };

export async function reactAction(commentId: string, kind: CommentReaction): Promise<ReactionResult> {
  const session = await getSession();
  if (!session) return { error: "Entre na sua conta para reagir." };
  if (!uuid.safeParse(commentId).success || !["like", "helpful", "haha"].includes(kind)) return { error: "Reação inválida." };
  try {
    const row = await reactToComment(commentId, session.userId, kind);
    return row ?? { error: "Esse comentário não está mais disponível." };
  } catch (e) {
    console.error("[react]", e);
    return { error: "Não foi possível registrar sua reação." };
  }
}

const reportSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("deal"), id: uuid, kind: z.enum(["out_of_stock", "coupon_failed", "price_changed", "spam", "fake"]), note: z.string().trim().max(300).optional() }),
  z.object({ target: z.literal("comment"), id: uuid, kind: z.enum(["spam", "offensive", "fake"]), note: z.string().trim().max(300).optional() }),
]);

export async function reportAction(input: unknown): Promise<{ message: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Entre na sua conta para enviar." };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { error: "Escolha um motivo." };
  const r = parsed.data;
  try {
    if (r.target === "deal") {
      const result = await reportDeal(r.id, session.userId, r.kind, r.note || null);
      if (result === "not_found") return { error: "Essa oferta não está mais no ar." };
      // Aviso de preço mudou, acabou ou cupom falhou: confere na loja já (se a última conferência passou de 10 min).
      if (result === "ok" && (r.kind === "out_of_stock" || r.kind === "coupon_failed" || r.kind === "price_changed")) await requestCheck(r.id, 10);
      const slug = await getDealSlugById(r.id);
      if (slug) revalidatePath(`/oferta/${slug}`);
      revalidatePath("/");
      return { message: result === "expired" ? "Obrigado! Com o seu aviso, a oferta foi encerrada." : "Obrigado! Recebemos o seu aviso e vamos conferir." };
    }
    const result = await reportComment(r.id, session.userId, r.kind, r.note || null);
    if (result === "not_found") return { error: "Esse comentário não está mais disponível." };
    const path = await pathForTarget(await getCommentTarget(r.id));
    if (path) revalidatePath(path);
    return { message: "Obrigado! A equipe vai revisar esse comentário." };
  } catch (e) {
    console.error("[report]", e);
    return { error: "Não foi possível enviar agora. Tente de novo." };
  }
}

export async function markExpiredAction(dealId: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Entre na sua conta." };
  if (!uuid.safeParse(dealId).success) return { error: "Oferta inválida." };
  try {
    const slug = await markDealExpired(dealId, { id: session.userId, role: session.role });
    if (!slug) return { error: "Só quem publicou ou a equipe pode encerrar a oferta." };
    revalidatePath(`/oferta/${slug}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    console.error("[expire]", e);
    return { error: "Não foi possível encerrar agora." };
  }
}

export async function subscribeAction(dealId: string, on: boolean): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session || !uuid.safeParse(dealId).success) return { ok: false };
  try {
    await setSubscription(dealId, session.userId, on);
    return { ok: true };
  } catch (e) {
    console.error("[subscribe]", e);
    return { ok: false };
  }
}

export async function removeCommentFormAction(form: FormData): Promise<void> {
  const session = await getSession();
  const id = String(form.get("id") ?? "");
  if (!session || !uuid.safeParse(id).success) return;
  const target = await removeComment(id, { id: session.userId, role: session.role });
  const path = await pathForTarget(target);
  if (path) revalidatePath(path);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, visitorHash } from "@/lib/auth";
import { getDealSlugById } from "@/lib/data/comments";
import { recordFeedback } from "@/lib/data/deal-check";

const input = z.object({ dealId: z.string().uuid(), worked: z.boolean() });

/** "Funcionou pra você?" Vale sem conta: uma resposta por pessoa (conta) ou por visitante no dia. */
export async function dealFeedbackAction(raw: unknown): Promise<{ ok: true } | { error: string }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "Resposta inválida." };
  try {
    const session = await getSession();
    const voter = session ? `u:${session.userId}` : `v:${await visitorHash()}`;
    const saved = await recordFeedback(parsed.data.dealId, voter, parsed.data.worked);
    if (!saved) return { error: "Essa oferta não está mais no ar." };
    const slug = await getDealSlugById(parsed.data.dealId);
    if (slug) revalidatePath(`/oferta/${slug}`);
    return { ok: true };
  } catch (e) {
    console.error("[funcionou]", e);
    return { error: "Não foi possível registrar agora. Tente de novo." };
  }
}

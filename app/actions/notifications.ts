"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { markAllRead } from "@/lib/data/social";

/** Chamada quando o painel de Avisos abre. */
export async function markNotificationsReadAction(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  try {
    await markAllRead(session.userId);
  } catch (e) {
    console.error("[notifications]", e);
  }
}

/** Botão "marcar todas como lidas" da página de notificações. */
export async function markAllReadFormAction(): Promise<void> {
  await markNotificationsReadAction();
  revalidatePath("/conta/notificacoes");
}

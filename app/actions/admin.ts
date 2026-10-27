"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { classifyUncategorized } from "@/lib/data/auto-category";
import { affiliateTemplateError } from "@/lib/affiliate";
import { requireAdmin } from "@/lib/auth";
import {
  LINK_MODES, STORE_STATUSES, USER_LINK_POLICIES,
  addBlockedDomain, removeBlockedDomain, updateStore,
} from "@/lib/data/admin";

const HOST = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function pick<T extends string>(v: FormDataEntryValue | null, allowed: readonly T[]): T | null {
  const s = String(v ?? "");
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
}

export type AdminState = { ok?: boolean; error?: string } | undefined;

export async function updateStoreAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Loja inválida." };
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) return { error: "O nome precisa ter de 2 a 60 caracteres." };

  const domains = [...new Set(String(form.get("domains") ?? "").split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean))];
  if (domains.some((d) => !HOST.test(d))) return { error: "Algum domínio é inválido. Use só o endereço, como loja.com.br." };

  const status = pick(form.get("status"), STORE_STATUSES);
  const linkMode = pick(form.get("linkMode"), LINK_MODES);
  const userLinkPolicy = pick(form.get("userLinkPolicy"), USER_LINK_POLICIES);
  if (!status || !linkMode || !userLinkPolicy) return { error: "Escolha uma opção válida em cada lista." };

  const split = Number(form.get("splitOwnerPct") ?? 0);
  if (!Number.isInteger(split) || split < 0 || split > 100) return { error: "A divisão precisa ser um número de 0 a 100." };

  const logo = String(form.get("logoUrl") ?? "").trim();
  if (logo && !/^https:\/\/\S+$/.test(logo)) return { error: "O logo precisa ser um endereço https." };
  const template = String(form.get("affiliateTemplate") ?? "").trim();
  const templateError = affiliateTemplateError(template);
  if (templateError) return { error: templateError };

  await updateStore(id, {
    name, status, domains, logoUrl: logo || null, linkMode, userLinkPolicy, splitOwnerPct: split, affiliateTemplate: template || null,
  });
  revalidatePath("/painel/lojas");
  revalidatePath("/");
  return { ok: true };
}

export async function blockDomainAction(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const raw = String(form.get("domain") ?? "").trim().toLowerCase();
  const domain = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!HOST.test(domain)) return { error: "Informe só o domínio, como golpe.com." };
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200);
  if (reason.length < 3) return { error: "Escreva o motivo do bloqueio." };
  await addBlockedDomain(domain, reason);
  revalidatePath("/painel/lojas");
  return { ok: true };
}

export async function unblockDomainAction(form: FormData) {
  await requireAdmin();
  const domain = String(form.get("domain") ?? "").trim().toLowerCase();
  if (HOST.test(domain)) await removeBlockedDomain(domain);
  revalidatePath("/painel/lojas");
}

/** Coloca categoria nas ofertas que estão sem (IA se ligada, senão regras por palavra). */
export async function classifyDealsAction() {
  await requireAdmin();
  const r = await classifyUncategorized();
  revalidatePath("/");
  redirect(`/painel/ofertas?classificadas=${r.updated}&ia=${r.usedAi ? 1 : 0}`);
}

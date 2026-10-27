"use client";
import { useActionState } from "react";
import { useKeepForm } from "./use-keep-form";
import { updateStoreAction, type AdminState } from "@/app/actions/admin";
import type { AdminStore } from "@/lib/data/admin";

const input = "h-10 w-full rounded-sm border border-border-input bg-bg px-2 text-sm";

const LINK_MODES = [
  ["direct", "Link direto (sem afiliado)"],
  ["direct_program", "Programa próprio da loja"],
  ["network", "Rede de afiliados"],
  ["monetizer", "Monetizador"],
] as const;

const POLICIES = [
  ["keep_author", "Manter o link do autor"],
  ["split", "Dividir com o dono do site"],
  ["replace", "Trocar pelo nosso link"],
  ["by_reputation", "Depende da reputação"],
] as const;

const STATUSES = [
  ["active", "Ativa"],
  ["pending_review", "Esperando revisão"],
  ["blocked", "Bloqueada"],
] as const;

/** Edição de uma loja. O modelo de link só vale para ofertas do dono e do robô; o link do usuário segue a política escolhida. */
export function StoreForm({ store }: { store: AdminStore }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(updateStoreAction, undefined);
  const submit = useKeepForm(action);
  const id = `s-${store.id}`;
  return (
    <form onSubmit={submit} className="grid gap-3 border-t border-border pt-4 md:grid-cols-2">
      <input type="hidden" name="id" value={store.id} />
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-bold">Nome</label>
        <input id={`${id}-name`} name="name" defaultValue={store.name} required maxLength={60} className={input} />
      </div>
      <div>
        <label htmlFor={`${id}-status`} className="mb-1 block text-sm font-bold">Situação</label>
        <select id={`${id}-status`} name="status" defaultValue={store.status} className={input}>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`${id}-domains`} className="mb-1 block text-sm font-bold">Domínios (separados por espaço ou vírgula)</label>
        <input id={`${id}-domains`} name="domains" defaultValue={store.domains.join(" ")} className={input} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`${id}-logo`} className="mb-1 block text-sm font-bold">Logo (endereço https)</label>
        <input id={`${id}-logo`} name="logoUrl" defaultValue={store.logoUrl ?? ""} className={input} />
      </div>
      <div>
        <label htmlFor={`${id}-mode`} className="mb-1 block text-sm font-bold">Modelo de link</label>
        <select id={`${id}-mode`} name="linkMode" defaultValue={store.linkMode} className={input}>
          {LINK_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-policy`} className="mb-1 block text-sm font-bold">Link de afiliado do usuário</label>
        <select id={`${id}-policy`} name="userLinkPolicy" defaultValue={store.userLinkPolicy} className={input}>
          {POLICIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`${id}-tpl`} className="mb-1 block text-sm font-bold">Nosso código de afiliado (vale só para ofertas da equipe e do robô)</label>
        <input id={`${id}-tpl`} name="affiliateTemplate" defaultValue={store.affiliateTemplate ?? ""} placeholder="Amazon: tag=SEU_ID-20 · Rede: https://rede.exemplo/ir?id=SEU_ID&to={url}" className={input} />
        <p className="mt-1 text-xs text-muted">Parâmetros (ex.: <code>tag=SEU_ID-20</code>) entram no fim do link da loja. Com <code>{"{url}"}</code>, o link da loja vai dentro do link da rede. Vazio: sem afiliado.</p>
      </div>
      <div>
        <label htmlFor={`${id}-split`} className="mb-1 block text-sm font-bold">Parte do dono na divisão (%)</label>
        <input id={`${id}-split`} name="splitOwnerPct" type="number" min={0} max={100} defaultValue={store.splitOwnerPct} className={input} />
      </div>
      <div className="flex items-end gap-3 md:col-span-2">
        <button type="submit" disabled={pending} className="h-10 rounded-pill bg-accent px-5 text-sm font-bold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar loja"}
        </button>
        <p role="status" className={`text-sm ${state?.error ? "text-danger" : "text-muted"}`}>
          {state?.error ?? (state?.ok ? "Salvo." : "")}
        </p>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { savePrefsAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { HOME_TABS, NOTIFY_GROUPS, type Prefs } from "@/lib/prefs";

function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-3 py-1.5 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 shrink-0 accent-(--color-accent)" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

type Section = "notify" | "feed" | "privacy";

export function PrefsForm({ section, prefs }: { section: Section; prefs: Prefs }) {
  const [state, action, pending] = useActionState(savePrefsAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="section" value={section} />

      {section === "notify" ? (
        <>
          {NOTIFY_GROUPS.map((g) => (
            <fieldset key={g.id} className="flex flex-col">
              <legend className="mb-1 font-bold">{g.title}</legend>
              {g.items.map((i) => (
                <Check key={i.kind} name={`n_${i.kind}`} label={i.label} defaultChecked={prefs.notify[i.kind] !== false} />
              ))}
            </fieldset>
          ))}
          <p className="text-xs text-muted">Os avisos aparecem no sininho do topo do site. O envio por e-mail ainda não está ativo.</p>
        </>
      ) : null}

      {section === "feed" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="home_tab" className="text-sm font-bold">Página inicial padrão</label>
            <select id="home_tab" name="home_tab" defaultValue={prefs.home_tab} className="h-11 w-full max-w-xs rounded-sm border border-border-input bg-bg px-3 text-base">
              {HOME_TABS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <fieldset className="flex flex-col">
            <legend className="mb-1 font-bold">Lista de ofertas</legend>
            <Check name="infinite_scroll" label="Rolagem infinita" hint="Carrega mais ofertas conforme você desce a página." defaultChecked={prefs.infinite_scroll} />
            <Check name="auto_subscribe" label="Seguir automaticamente as ofertas em que eu comentar" defaultChecked={prefs.auto_subscribe} />
          </fieldset>
          <fieldset className="flex flex-col">
            <legend className="mb-1 font-bold">Blocos da lateral</legend>
            <Check name="w_hot" label="Ofertas mais quentes" defaultChecked={prefs.widgets.hot} />
            <Check name="w_categories" label="Categorias populares" defaultChecked={prefs.widgets.categories} />
            <Check name="w_coupons" label="Melhores cupons" defaultChecked={prefs.widgets.coupons} />
            <Check name="w_discussions" label="Discussões" defaultChecked={prefs.widgets.discussions} />
          </fieldset>
        </>
      ) : null}

      {section === "privacy" ? (
        <fieldset className="flex flex-col">
          <legend className="mb-1 font-bold">Quem pode falar comigo</legend>
          <Check name="allow_follow" label="Permitir que outras pessoas me sigam" defaultChecked={prefs.allow_follow} />
          <Check name="allow_messages" label="Permitir mensagens privadas" defaultChecked={prefs.allow_messages} />
        </fieldset>
      ) : null}

      {state?.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">Salvo.</FormMessage> : null}
      <div><Button type="submit" loading={pending}>Salvar</Button></div>
    </form>
  );
}

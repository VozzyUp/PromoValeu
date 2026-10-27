"use client";
import { useActionState } from "react";
import { useKeepForm } from "./use-keep-form";
import { saveChannelAction, testChannelAction, type ChannelState } from "@/app/actions/channels";
import { DEFAULT_TEMPLATE } from "@/lib/dispatch/format";

const input = "h-10 w-full rounded-sm border border-border-input bg-bg px-2 text-sm";

export type ChannelValues = {
  id?: string; name: string; type: "telegram" | "whatsapp"; target: string; active: boolean; minVerdict: "any" | "verified" | "good_price";
  minDiscountPct: number; windowStart: string; windowEnd: string; maxPerHour: number; template: string; linkMode: "site" | "direct";
};

export const NEW_CHANNEL: ChannelValues = {
  name: "", type: "telegram", target: "", active: false, minVerdict: "any", minDiscountPct: 20, windowStart: "08:00", windowEnd: "22:00",
  maxPerHour: 6, template: DEFAULT_TEMPLATE, linkMode: "site",
};

export function ChannelForm({ ch }: { ch: ChannelValues }) {
  const [state, action, pending] = useActionState<ChannelState, FormData>(saveChannelAction, undefined);
  const submit = useKeepForm(action);
  const [tState, tAction, tPending] = useActionState<ChannelState, FormData>(testChannelAction, undefined);
  const submitTest = useKeepForm(tAction);
  const k = ch.id ?? "new";
  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        {ch.id ? <input type="hidden" name="id" value={ch.id} /> : null}
        <div><label htmlFor={`n-${k}`} className="mb-1 block text-sm font-bold">Nome</label><input id={`n-${k}`} name="name" defaultValue={ch.name} required className={input} /></div>
        <div>
          <label htmlFor={`t-${k}`} className="mb-1 block text-sm font-bold">Tipo</label>
          <select id={`t-${k}`} name="type" defaultValue={ch.type} className={input}><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp (UAZAPI)</option></select>
        </div>
        <div className="md:col-span-2"><label htmlFor={`g-${k}`} className="mb-1 block text-sm font-bold">Destino (Telegram: @canal ou id do chat · WhatsApp: link do canal, número ou id do grupo)</label><input id={`g-${k}`} name="target" defaultValue={ch.target} required className={input} /></div>
        <div>
          <label htmlFor={`v-${k}`} className="mb-1 block text-sm font-bold">Selo mínimo</label>
          <select id={`v-${k}`} name="minVerdict" defaultValue={ch.minVerdict} className={input}>
            <option value="any">Qualquer (menos inflado)</option><option value="good_price">Bom preço ou verificado</option><option value="verified">Só verificado</option>
          </select>
        </div>
        <div><label htmlFor={`d-${k}`} className="mb-1 block text-sm font-bold">Desconto mínimo (%)</label><input id={`d-${k}`} name="minDiscountPct" type="number" min={0} max={95} defaultValue={ch.minDiscountPct} className={input} /></div>
        <div><label htmlFor={`ws-${k}`} className="mb-1 block text-sm font-bold">Enviar a partir de (Brasília)</label><input id={`ws-${k}`} name="windowStart" defaultValue={ch.windowStart} className={input} /></div>
        <div><label htmlFor={`we-${k}`} className="mb-1 block text-sm font-bold">Enviar até</label><input id={`we-${k}`} name="windowEnd" defaultValue={ch.windowEnd} className={input} /></div>
        <div><label htmlFor={`h-${k}`} className="mb-1 block text-sm font-bold">Máximo por hora</label><input id={`h-${k}`} name="maxPerHour" type="number" min={1} max={60} defaultValue={ch.maxPerHour} className={input} /></div>
        <div>
          <label htmlFor={`l-${k}`} className="mb-1 block text-sm font-bold">O link da mensagem leva para</label>
          <select id={`l-${k}`} name="linkMode" defaultValue={ch.linkMode} className={input}><option value="site">A página da oferta no site</option><option value="direct">A loja (passando pelo nosso contador de cliques)</option></select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor={`m-${k}`} className="mb-1 block text-sm font-bold">Modelo da mensagem</label>
          <textarea id={`m-${k}`} name="template" defaultValue={ch.template} rows={6} className="w-full rounded-sm border border-border-input bg-bg p-2 font-mono text-sm" />
          <p className="mt-1 text-xs text-muted">Campos: {"{titulo} {preco} {de} {desconto} {loja} {cupom} {selo} {link}"}. Use *texto* para negrito.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={ch.active} className="size-4" /> Ligado</label>
        <div className="flex items-center gap-3 md:col-span-2">
          <button type="submit" disabled={pending} className="h-10 rounded-pill bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-50">{pending ? "Salvando…" : ch.id ? "Salvar canal" : "Criar canal"}</button>
          <p role="status" className={`text-sm ${state?.error ? "text-danger" : "text-muted"}`}>{state?.error ?? (state?.ok ? "Salvo." : "")}</p>
        </div>
      </form>
      {ch.id ? (
        <form onSubmit={submitTest} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={ch.id} />
          <button type="submit" disabled={tPending} className="h-9 rounded-pill border border-accent px-4 text-sm font-bold text-accent disabled:opacity-50">{tPending ? "Enviando…" : "Enviar mensagem de teste"}</button>
          <p role="status" className={`text-sm ${tState?.error ? "text-danger" : "text-muted"}`}>{tState?.error ?? tState?.message ?? ""}</p>
        </form>
      ) : null}
    </div>
  );
}
"use client";
import { useActionState, useState } from "react";
import { useKeepForm } from "./use-keep-form";
import { loadChatsAction, loadWhatsappGroupsAction, saveSourceAction, type ChatsState, type GroupsState, type SourceState } from "@/app/actions/sources";

const input = "h-10 w-full rounded-sm border border-border-input bg-bg px-2 text-sm";

export type SourceValues = {
  id?: string; name: string; kind: "telegram_public" | "telegram_account" | "whatsapp_channel" | "whatsapp_group"; targetLabel: string; cron: string; categoryId: string;
  minDiscountPct: number; maxPrice: string; blockWords: string; perRun: number; takeCoupons: boolean; autoPublish: boolean; active: boolean;
};

export const NEW_SOURCE: SourceValues = {
  name: "", kind: "telegram_public", targetLabel: "", cron: "*/10 * * * *", categoryId: "", minDiscountPct: 0, maxPrice: "",
  blockWords: "", perRun: 15, takeCoupons: true, autoPublish: false, active: true,
};

const KIND_LABEL: Record<SourceValues["kind"], string> = {
  telegram_public: "Canal público do Telegram",
  telegram_account: "Conta do Telegram",
  whatsapp_channel: "Canal do WhatsApp",
  whatsapp_group: "Grupo do WhatsApp",
};

const FREQUENCIES = [
  ["*/5 * * * *", "A cada 5 minutos"],
  ["*/10 * * * *", "A cada 10 minutos"],
  ["*/15 * * * *", "A cada 15 minutos"],
  ["*/30 * * * *", "A cada 30 minutos"],
  ["0 * * * *", "De hora em hora"],
] as const;

export function SourceForm({ source, categories, accountConnected }: { source: SourceValues; categories: { id: string; name: string }[]; accountConnected: boolean }) {
  const [state, action, pending] = useActionState<SourceState, FormData>(saveSourceAction, undefined);
  const [chats, loadChats, loadingChats] = useActionState<ChatsState>(loadChatsAction, undefined);
  const [groups, loadGroups, loadingGroups] = useActionState<GroupsState>(loadWhatsappGroupsAction, undefined);
  const [kind, setKind] = useState(source.kind);
  const submit = useKeepForm(action);
  const k = source.id ?? "new";
  const isNew = !source.id;
  const freqs = FREQUENCIES.some(([v]) => v === source.cron) ? FREQUENCIES : [...FREQUENCIES, [source.cron, source.cron] as const];

  return (
    <div className="flex flex-col gap-3">
      {isNew && kind === "telegram_account" ? (
        <form action={loadChats} className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={!accountConnected || loadingChats} className="h-9 rounded-pill border border-accent px-4 text-sm font-bold text-accent disabled:opacity-50">
            {loadingChats ? "Carregando…" : "Carregar meus grupos e canais"}
          </button>
          <p role="status" className={`text-sm ${chats?.error ? "text-danger" : "text-muted"}`}>
            {!accountConnected ? "Conecte a conta do Telegram acima primeiro." : chats?.error ?? (chats?.chats ? `${chats.chats.length} encontrados.` : "")}
          </p>
        </form>
      ) : null}
      {isNew && kind === "whatsapp_group" ? (
        <form action={loadGroups} className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={loadingGroups} className="h-9 rounded-pill border border-accent px-4 text-sm font-bold text-accent disabled:opacity-50">
            {loadingGroups ? "Carregando…" : "Carregar os grupos do WhatsApp"}
          </button>
          <p role="status" className={`text-sm ${groups?.error ? "text-danger" : "text-muted"}`}>
            {groups?.error ?? (groups?.groups ? `${groups.groups.length} grupos. O número da UAZAPI precisa estar no grupo.` : "O número conectado na UAZAPI precisa estar no grupo.")}
          </p>
        </form>
      ) : null}

      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        {source.id ? <input type="hidden" name="id" value={source.id} /> : null}
        <div>
          <label htmlFor={`sn-${k}`} className="mb-1 block text-sm font-bold">Nome</label>
          <input id={`sn-${k}`} name="name" defaultValue={source.name} required maxLength={60} placeholder="Ex.: Promoções do Dia" className={input} />
        </div>
        {isNew ? (
          <div>
            <label htmlFor={`sk-${k}`} className="mb-1 block text-sm font-bold">Tipo</label>
            <select id={`sk-${k}`} name="kind" value={kind} onChange={(e) => setKind(e.target.value as SourceValues["kind"])} className={input}>
              <option value="telegram_public">Canal público (sem login)</option>
              <option value="telegram_account">Grupo ou canal da minha conta</option>
              <option value="whatsapp_channel">Canal do WhatsApp</option>
              <option value="whatsapp_group">Grupo do WhatsApp</option>
            </select>
          </div>
        ) : (
          <p className="self-end text-sm text-muted">{KIND_LABEL[source.kind]}: <strong>{source.targetLabel}</strong></p>
        )}
        {isNew && kind === "telegram_public" ? (
          <div className="md:col-span-2">
            <label htmlFor={`sc-${k}`} className="mb-1 block text-sm font-bold">Canal (@nome ou link t.me/nome)</label>
            <input id={`sc-${k}`} name="channel" required placeholder="@promocoesdodia" className={input} />
          </div>
        ) : null}
        {isNew && kind === "whatsapp_channel" ? (
          <div className="md:col-span-2">
            <label htmlFor={`sw-${k}`} className="mb-1 block text-sm font-bold">Link do canal (no WhatsApp: abra o canal, toque no nome e em Compartilhar)</label>
            <input id={`sw-${k}`} name="waChannel" required placeholder="https://whatsapp.com/channel/0029Va..." className={input} />
          </div>
        ) : null}
        {isNew && kind === "whatsapp_group" ? (
          <div className="md:col-span-2">
            <label htmlFor={`swg-${k}`} className="mb-1 block text-sm font-bold">Grupo</label>
            <select id={`swg-${k}`} name="waGroup" required className={input} defaultValue="">
              <option value="" disabled>{groups?.groups ? "Escolha" : "Carregue a lista acima"}</option>
              {(groups?.groups ?? []).map((g) => <option key={g.jid} value={`${g.jid}::${encodeURIComponent(g.name)}`}>{g.name}</option>)}
            </select>
          </div>
        ) : null}
        {isNew && kind === "telegram_account" ? (
          <div className="md:col-span-2">
            <label htmlFor={`sg-${k}`} className="mb-1 block text-sm font-bold">Grupo ou canal</label>
            <select id={`sg-${k}`} name="chat" required className={input} defaultValue="">
              <option value="" disabled>{chats?.chats ? "Escolha" : "Carregue a lista acima"}</option>
              {(chats?.chats ?? []).map((c) => <option key={c.target} value={`${c.target}::${encodeURIComponent(c.title)}`}>{c.title} ({c.kind})</option>)}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor={`sf-${k}`} className="mb-1 block text-sm font-bold">Frequência</label>
          <select id={`sf-${k}`} name="cron" defaultValue={source.cron} className={input}>
            {freqs.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`sg2-${k}`} className="mb-1 block text-sm font-bold">Categoria das ofertas</label>
          <select id={`sg2-${k}`} name="categoryId" defaultValue={source.categoryId} className={input}>
            <option value="">Sem categoria (escolho na aprovação)</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`sd-${k}`} className="mb-1 block text-sm font-bold">Desconto mínimo (%, 0 = qualquer)</label>
          <input id={`sd-${k}`} name="minDiscountPct" type="number" min={0} max={95} defaultValue={source.minDiscountPct} className={input} />
        </div>
        <div>
          <label htmlFor={`sp-${k}`} className="mb-1 block text-sm font-bold">Preço máximo (R$, vazio = sem limite)</label>
          <input id={`sp-${k}`} name="maxPrice" defaultValue={source.maxPrice} className={input} />
        </div>
        <div>
          <label htmlFor={`sr-${k}`} className="mb-1 block text-sm font-bold">Ofertas por rodada</label>
          <input id={`sr-${k}`} name="perRun" type="number" min={1} max={50} defaultValue={source.perRun} className={input} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor={`sb-${k}`} className="mb-1 block text-sm font-bold">Palavras bloqueadas (uma por linha; a publicação que tiver alguma é ignorada)</label>
          <textarea id={`sb-${k}`} name="blockWords" defaultValue={source.blockWords} rows={2} placeholder={"sorteio\nusado"} className="w-full rounded-sm border border-border-input bg-bg p-2 text-sm" />
        </div>
        <div className="flex flex-wrap items-end gap-4 md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={source.active} className="size-4" /> Ligada</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="takeCoupons" defaultChecked={source.takeCoupons} className="size-4" /> Trazer cupons da loja</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="autoPublish" defaultChecked={source.autoPublish} className="size-4" /> Publicar direto (sem fila)</label>
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <button type="submit" disabled={pending} className="h-10 rounded-pill bg-accent px-5 text-sm font-bold text-on-accent hover:bg-accent-hover disabled:opacity-50">
            {pending ? "Salvando…" : isNew ? "Adicionar fonte" : "Salvar fonte"}
          </button>
          <p role="status" className={`text-sm ${state?.error ? "text-danger" : "text-muted"}`}>{state?.error ?? (state?.ok ? "Salvo." : "")}</p>
        </div>
      </form>
    </div>
  );
}

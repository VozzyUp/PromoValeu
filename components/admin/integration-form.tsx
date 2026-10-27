"use client";
import { useActionState } from "react";
import { useKeepForm } from "./use-keep-form";
import { integrationAction, type IntegrationState } from "@/app/actions/integrations";
import type { IntegrationDef } from "@/lib/integrations-def";
import type { IntegrationView } from "@/lib/data/integrations";

const input = "h-10 w-full rounded-sm border border-border-input bg-bg px-2 text-sm";
const STATUS = { ok: "Conectado", error: "Com erro", untested: "Não testado" } as const;

export function IntegrationForm({ def, view }: { def: IntegrationDef; view: IntegrationView }) {
  const [state, action, pending] = useActionState<IntegrationState, FormData>(integrationAction, undefined);
  const submit = useKeepForm(action);
  return (
    <form onSubmit={submit} className="rounded-card bg-bg p-4 shadow-card">
      <input type="hidden" name="key" value={def.key} />
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="text-title font-bold">{def.title}</h2>
        <span className={`rounded-pill px-2 py-0.5 text-xs font-bold ${view.status === "ok" ? "bg-surface text-price" : view.status === "error" ? "bg-danger text-on-accent" : "bg-surface text-muted"}`}>
          {STATUS[view.status]}
        </span>
      </div>
      <p className="mb-3 text-sm text-muted">{def.help}</p>
      {view.lastError ? <p className="mb-3 text-sm text-danger">Último erro: {view.lastError}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {def.fields.map((f) => (
          <div key={f.name}>
            <label htmlFor={`${def.key}-${f.name}`} className="mb-1 block text-sm font-bold">{f.label}</label>
            <input
              id={`${def.key}-${f.name}`} name={f.name} type={f.secret ? "password" : "text"} autoComplete="off"
              defaultValue={f.secret ? "" : view.values[f.name] ?? ""}
              placeholder={f.secret ? (view.secretsSet[f.name] ? "Salvo. Deixe vazio para manter." : "Cole aqui") : f.placeholder}
              className={input}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="enabled" defaultChecked={view.enabled} className="size-4" /> Ligada
        </label>
        <button type="submit" name="intent" value="save" disabled={pending} className="h-10 rounded-pill border border-accent px-4 text-sm font-bold text-accent disabled:opacity-50">Salvar</button>
        <button type="submit" name="intent" value="test" disabled={pending} className="h-10 rounded-pill bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-50">
          {pending ? "Aguarde…" : "Salvar e testar conexão"}
        </button>
        {def.connect ? (
          <a href={def.connect.href} className="h-10 content-center rounded-pill bg-price px-4 text-sm font-bold text-on-accent">{def.connect.label}</a>
        ) : null}
        <p role="status" className={`text-sm ${state && state.ok === false ? "text-danger" : "text-muted"}`}>{state?.message ?? ""}</p>
      </div>
    </form>
  );
}
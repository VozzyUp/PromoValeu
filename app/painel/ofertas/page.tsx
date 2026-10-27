import Link from "next/link";
import { classifyDealsAction } from "@/app/actions/admin";
import { dealStaffAction } from "@/app/actions/staff";
import { DealEditForm } from "@/components/admin/deal-edit-form";
import { requireModerator } from "@/lib/auth";
import { listCategories } from "@/lib/data";
import { listStaffDeals } from "@/lib/data/staff";
import { formatPrice, isFuture, timeAgo } from "@/lib/format";
import { supabaseEnabled } from "@/lib/supabase/server";

export const metadata = { title: "Painel: ofertas e cupons" };

const STATUS: Record<string, string> = { pending: "Pendente", published: "No ar", expired: "Expirada", rejected: "Recusada", removed: "Removida" };
const input = "h-10 rounded-sm border border-border-input bg-bg px-2 text-sm";

export default async function PanelDealsPage({ searchParams }: PageProps<"/painel/ofertas">) {
  await requireModerator();
  if (!supabaseEnabled()) return <p className="mx-auto max-w-(--layout-max) px-4 py-8 text-sm text-muted">Precisa do Supabase configurado.</p>;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = one(sp.status);
  const kind = one(sp.tipo) === "cupom" ? "cupom" : one(sp.tipo) === "oferta" ? "oferta" : undefined;
  const q = one(sp.q).trim();
  const page = Math.max(1, Number(one(sp.p)) || 1);
  const [{ items, hasNext }, categories] = await Promise.all([listStaffDeals({ status, q, kind, page }), listCategories()]);
  const qs = (p: number) => `?${new URLSearchParams({ ...(status ? { status } : {}), ...(kind ? { tipo: kind } : {}), ...(q ? { q } : {}), p: String(p) })}`;
  return (
    <div className="mx-auto max-w-(--layout-max) px-4 py-8">
      <h1 className="text-xl font-bold">Ofertas e cupons</h1>
      <form className="my-4 flex flex-wrap items-end gap-2" role="search">
        <div><label htmlFor="f-q" className="mb-1 block text-sm font-bold">Título</label><input id="f-q" name="q" defaultValue={q} className={`${input} w-56`} /></div>
        <div><label htmlFor="f-s" className="mb-1 block text-sm font-bold">Situação</label>
          <select id="f-s" name="status" defaultValue={status} className={input}>
            <option value="">Todas</option>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label htmlFor="f-t" className="mb-1 block text-sm font-bold">Tipo</label>
          <select id="f-t" name="tipo" defaultValue={kind ?? ""} className={input}>
            <option value="">Ofertas e cupons</option><option value="oferta">Só ofertas</option><option value="cupom">Só cupons</option>
          </select></div>
        <button type="submit" className="h-10 rounded-pill bg-accent px-5 text-sm font-bold text-on-accent">Filtrar</button>
        <Link href="/publicar/oferta" className="h-10 content-center rounded-pill border border-accent px-4 text-sm font-bold text-accent">Nova oferta manual</Link>
      </form>
      <form action={classifyDealsAction} className="mb-4 flex flex-wrap items-center gap-3 rounded-card bg-surface p-3">
        <button type="submit" className="h-9 rounded-pill border border-accent px-4 text-sm font-bold text-accent">Classificar ofertas sem categoria</button>
        <p role="status" className="text-sm text-muted">
          {one(sp.classificadas)
            ? `${one(sp.classificadas)} ofertas classificadas${one(sp.ia) === "1" ? " pela IA" : " pelas regras (ligue a IA em Integrações para usar a IA)"}.`
            : "As novas já entram com categoria. Use para as que entraram antes."}
        </p>
      </form>
      <ul className="flex flex-col gap-3">
        {items.length === 0 ? <li className="text-sm text-muted">Nada encontrado.</li> : null}
        {items.map((d) => (
          <li key={d.id} className="rounded-card bg-bg p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/oferta/${d.slug}`} className="font-bold hover:text-accent">{d.title}</Link>
                <p className="text-sm text-muted">
                  {STATUS[d.status]} · {d.store} · {d.priceCents != null ? formatPrice(d.priceCents) : `cupom ${d.couponCode}`} · {d.source === "robot" ? "robô" : `por ${d.author}`} · {timeAgo(d.createdAt)}
                  {isFuture(d.boostedUntil) ? " · em destaque" : ""}{d.isSponsored ? " · patrocinada" : ""}
                </p>
              </div>
              <form action={dealStaffAction} className="flex flex-wrap gap-1">
                <input type="hidden" name="id" value={d.id} />
                {d.status === "published" ? <button name="act" value="expire" className="h-9 rounded-pill px-3 text-sm font-bold hover:bg-surface">Expirar</button> : null}
                {d.status === "expired" || d.status === "removed" ? <button name="act" value="republish" className="h-9 rounded-pill px-3 text-sm font-bold hover:bg-surface">Republicar</button> : null}
                {d.status === "published" ? (isFuture(d.boostedUntil)
                  ? <button name="act" value="unboost" className="h-9 rounded-pill px-3 text-sm font-bold hover:bg-surface">Tirar destaque</button>
                  : (
                    <span className="flex items-center gap-1">
                      <label htmlFor={`h-${d.id}`} className="sr-only">Horas de destaque</label>
                      <select id={`h-${d.id}`} name="hours" defaultValue="24" className="h-9 rounded-sm border border-border-input bg-bg px-1 text-sm">
                        {[6, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h} h</option>)}
                      </select>
                      <button name="act" value="boost" className="h-9 rounded-pill px-3 text-sm font-bold hover:bg-surface">Destacar</button>
                    </span>
                  )) : null}
                {d.status === "published" ? (d.isSponsored
                  ? <button name="act" value="unsponsor" className="h-9 rounded-pill px-3 text-sm font-bold hover:bg-surface">Tirar patrocínio</button>
                  : <button name="act" value="sponsor" className="h-9 rounded-pill px-3 text-sm font-bold hover:bg-surface">Marcar patrocinada</button>) : null}
                {d.status !== "removed" ? <button name="act" value="remove" className="h-9 rounded-pill px-3 text-sm text-danger hover:bg-surface">Remover</button> : null}
              </form>
            </div>
            <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-accent">Editar</summary>
              <div className="mt-3"><DealEditForm id={d.id} title={d.title} categoryId={d.categoryId} ean={d.ean} categories={categories} /></div>
            </details>
          </li>
        ))}
      </ul>
      <nav className="mt-6 flex justify-between text-sm font-bold" aria-label="Páginas">
        {page > 1 ? <Link href={qs(page - 1)} className="text-accent">← Anteriores</Link> : <span />}
        {hasNext ? <Link href={qs(page + 1)} className="text-accent">Próximas →</Link> : null}
      </nav>
    </div>
  );
}
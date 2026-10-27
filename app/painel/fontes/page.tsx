import Link from "next/link";
import { deleteSourceAction } from "@/app/actions/sources";
import { RunNow } from "@/components/admin/run-now";
import { NEW_SOURCE, SourceForm, type SourceValues } from "@/components/admin/source-form";
import { TelegramLogin } from "@/components/admin/telegram-login";
import { requireAdmin } from "@/lib/auth";
import { hasMasterKey } from "@/lib/crypto";
import { listCategories } from "@/lib/data";
import { formatPrice, timeAgo } from "@/lib/format";
import { accountStatus } from "@/lib/sources/telegram-account";
import { db } from "@/lib/supabase/db";
import { supabaseEnabled } from "@/lib/supabase/server";

export const metadata = { title: "Painel: fontes de ofertas" };
export const dynamic = "force-dynamic";

type Row = {
  id: string; name: string; kind: SourceValues["kind"]; target: string; target_title: string | null; active: boolean; cron: string;
  category_id: string | null; min_discount_bp: number; max_price_cents: number | null; block_words: string[]; per_run: number;
  take_coupons: boolean; auto_publish: boolean; last_run_at: string | null; last_error: string | null;
};

type Item = {
  id: number; source_id: string; message_id: number; post_url: string | null; link: string | null; store_url: string | null; title: string | null;
  price_cents: number | null; coupon_code: string | null; status: "created" | "duplicate" | "filtered" | "no_store_link" | "error"; reason: string | null;
  created_at: string; sources: { name: string } | null; deals: { slug: string; status: string } | null;
};

const ITEM_LABEL: Record<Item["status"], string> = {
  created: "Criada", duplicate: "Repetida", filtered: "Filtrada", no_store_link: "Sem link da loja", error: "Erro",
};
const DEAL_LABEL: Record<string, string> = { pending: "na fila", published: "publicada", rejected: "recusada", removed: "removida", expired: "expirada" };

const FREQ: Record<string, string> = { "*/5 * * * *": "a cada 5 min", "*/10 * * * *": "a cada 10 min", "*/15 * * * *": "a cada 15 min", "*/30 * * * *": "a cada 30 min", "0 * * * *": "de hora em hora" };

export default async function PanelSourcesPage() {
  await requireAdmin();
  if (!supabaseEnabled()) return <p className="mx-auto max-w-(--layout-max) px-4 py-8 text-sm text-muted">Precisa do Supabase configurado.</p>;

  const sources = await db().from("sources").select("*").order("created_at");
  if (sources.error) {
    return (
      <div className="mx-auto max-w-(--layout-max) px-4 py-8">
        <h1 className="text-xl font-bold">Fontes de ofertas</h1>
        <p className="mt-2 text-sm text-danger">
          {sources.error.code === "42P01" || sources.error.code === "PGRST205" ? "Falta rodar a migração 8 (fontes) no SQL Editor do Supabase." : sources.error.message}
        </p>
      </div>
    );
  }
  const [categories, status, items] = await Promise.all([
    listCategories(),
    accountStatus(),
    db().from("source_items").select("*, sources(name), deals(slug, status)").order("created_at", { ascending: false }).limit(60),
  ]);
  const rows = (sources.data ?? []) as Row[];
  const recent = (items.data ?? []) as unknown as Item[];

  const toValues = (r: Row): SourceValues => ({
    id: r.id, name: r.name, kind: r.kind, targetLabel: r.target_title ?? r.target, cron: r.cron, categoryId: r.category_id ?? "",
    minDiscountPct: r.min_discount_bp / 100, maxPrice: r.max_price_cents != null ? String(r.max_price_cents / 100).replace(".", ",") : "",
    blockWords: r.block_words.join("\n"), perRun: r.per_run, takeCoupons: r.take_coupons, autoPublish: r.auto_publish, active: r.active,
  });

  return (
    <div className="mx-auto flex max-w-(--layout-max) flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-bold">Fontes de ofertas (Telegram e WhatsApp)</h1>
        <p className="text-sm text-muted">
          O robô lê os canais e grupos cadastrados, segue o link de cada oferta até a loja, tira o código de afiliado de quem publicou e
          monta a oferta com o link limpo. Sem “publicar direto”, tudo cai na <Link href="/painel" className="font-bold text-accent hover:underline">fila de ofertas</Link> para você aprovar.
          Publicações sem link de loja, repetidas ou fora dos filtros ficam listadas abaixo com o motivo.
        </p>
        <p className="mt-2 text-sm text-muted">
          WhatsApp: usa o número conectado na integração da UAZAPI. Canais: cole o link do canal. Grupos: o número precisa estar no grupo.
        </p>
      </div>

      <section aria-labelledby="conta-t" className="rounded-card bg-bg p-4 shadow-card">
        <h2 id="conta-t" className="text-title font-bold">Conta do Telegram (opcional)</h2>
        <p className="mb-3 text-sm text-muted">
          Só para grupos privados ou canais sem página pública. Canais públicos não precisam de login. Crie o api_id e o api_hash em
          {" "}<a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="font-bold text-accent hover:underline">my.telegram.org</a> (Ferramentas de API).
          Prefira um número separado do pessoal: a conta só lê, mas o Telegram pode limitar contas que leem muito.
        </p>
        {hasMasterKey() ? <TelegramLogin status={status} /> : <p className="text-sm text-danger">Configure a MASTER_KEY no servidor para guardar a sessão com segurança.</p>}
      </section>

      <section aria-labelledby="fontes-t" className="flex flex-col gap-3">
        <h2 id="fontes-t" className="text-title font-bold">Fontes cadastradas</h2>
        {rows.length === 0 ? <p className="text-sm text-muted">Nenhuma fonte ainda. Adicione a primeira abaixo.</p> : null}
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-card bg-bg p-4 shadow-card">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold">{r.name}</span>
                  <span className={`rounded-pill px-2 py-0.5 text-xs font-bold ${r.active ? "bg-accent text-on-accent" : "bg-surface text-muted"}`}>{r.active ? "Ligada" : "Desligada"}</span>
                  <span className="text-sm text-muted">
                    {r.target_title ?? r.target} · {FREQ[r.cron] ?? r.cron} · {r.auto_publish ? "publica direto" : "vai para a fila"} · última leitura {r.last_run_at ? timeAgo(r.last_run_at) : "nunca"}
                  </span>
                  {r.last_error ? <span className="w-full text-sm text-danger">Erro na última leitura: {r.last_error}</span> : null}
                </summary>
                <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                  <SourceForm source={toValues(r)} categories={categories} accountConnected={status.connected} />
                  <div className="flex flex-wrap items-center gap-4">
                    <RunNow job={`source:${r.id}`} label="Ler agora" />
                    <form action={deleteSourceAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="h-9 rounded-pill px-3 text-sm font-bold text-danger hover:bg-surface">Apagar fonte</button>
                    </form>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="nova-t" className="rounded-card bg-bg p-4 shadow-card">
        <h2 id="nova-t" className="mb-3 text-title font-bold">Nova fonte</h2>
        <SourceForm source={NEW_SOURCE} categories={categories} accountConnected={status.connected} />
      </section>

      <section aria-labelledby="lidas-t" className="rounded-card bg-bg p-4 shadow-card">
        <h2 id="lidas-t" className="mb-3 text-title font-bold">Últimas publicações lidas</h2>
        {recent.length === 0 ? <p className="text-sm text-muted">Nada lido ainda.</p> : (
          <ul className="divide-y divide-border">
            {recent.map((it) => (
              <li key={it.id} className="flex flex-col gap-1 py-3 text-sm md:flex-row md:items-start md:justify-between md:gap-4">
                <div className="min-w-0">
                  <p className="font-bold">{it.title ?? "Sem título"}{it.price_cents != null ? <span className="font-normal text-muted"> · {formatPrice(it.price_cents)}</span> : null}{it.coupon_code ? <span className="font-normal text-muted"> · cupom {it.coupon_code}</span> : null}</p>
                  <p className="truncate text-xs text-muted" title={it.store_url ?? it.link ?? undefined}>{it.store_url ?? it.link ?? ""}</p>
                  <p className="text-xs text-muted">
                    {it.sources?.name ?? "Fonte apagada"} · {timeAgo(it.created_at)}
                    {it.post_url ? <> · <a href={it.post_url} target="_blank" rel="noopener noreferrer" className="font-bold text-accent hover:underline">ver publicação</a></> : null}
                  </p>
                </div>
                <div className="shrink-0 md:text-right">
                  <span className={`rounded-pill px-2 py-0.5 text-xs font-bold ${it.status === "created" ? "bg-accent text-on-accent" : it.status === "error" ? "bg-danger text-on-accent" : "bg-surface text-muted"}`}>{ITEM_LABEL[it.status]}</span>
                  {it.deals ? <p className="mt-1 text-xs"><Link href={`/oferta/${it.deals.slug}`} className="font-bold text-accent hover:underline">Oferta {DEAL_LABEL[it.deals.status] ?? it.deals.status}</Link></p> : null}
                  {it.reason ? <p className="mt-1 max-w-xs text-xs text-muted">{it.reason}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

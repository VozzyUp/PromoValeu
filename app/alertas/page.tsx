import { BellOff, Bell, Trash2 } from "lucide-react";
import Link from "next/link";
import { removeAlertFormAction, toggleAlertFormAction } from "@/app/actions/alerts";
import { AlertForm } from "@/components/forms/alert-form";
import { requireUser } from "@/lib/auth";
import { listCategories } from "@/lib/data";
import { listAlerts, MAX_ALERTS } from "@/lib/data/alerts";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Alertas de oferta" };

const IDEAS = ["iphone", "tênis", "air fryer", "notebook", "ps5", "geladeira", "smart tv", "fone bluetooth"];

export default async function AlertsPage({ searchParams }: PageProps<"/alertas">) {
  const session = await requireUser("/alertas");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const [alerts, categories] = await Promise.all([listAlerts(session.userId), listCategories()]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <header>
        <h1 className="text-xl font-bold md:text-display">Que nenhuma oferta passe batido</h1>
        <p className="mt-2 text-muted">
          Diga o que você quer e a gente avisa no sininho do topo quando aparecer uma oferta que combina. Você pode ter até {MAX_ALERTS} alertas.
        </p>
      </header>

      <section aria-labelledby="novo-alerta" className="rounded-card bg-bg p-4 shadow-card md:p-6">
        <h2 id="novo-alerta" className="mb-4 text-title font-bold">Novo alerta</h2>
        <AlertForm key={q} categories={categories.map((c) => ({ id: c.id, name: c.name }))} initialKeyword={q} />
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-sm font-bold">Ideias populares</p>
          <ul className="flex flex-wrap gap-2">
            {IDEAS.map((i) => (
              <li key={i}>
                <Link href={`/alertas?q=${encodeURIComponent(i)}`} className="inline-block rounded-pill border border-border px-3 py-1.5 text-sm hover:bg-surface">
                  {i}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="meus-alertas" className="rounded-card bg-bg p-4 shadow-card md:p-6">
        <h2 id="meus-alertas" className="mb-4 text-title font-bold">Seus alertas ({alerts.length})</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted">Você ainda não criou nenhum alerta.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className={a.active ? "" : "opacity-60"}>
                  <p className="font-bold">{a.keyword}</p>
                  <p className="text-sm text-muted">
                    {a.maxPriceCents != null ? `até ${formatPrice(a.maxPriceCents)}` : "qualquer preço"} · {a.categoryName ?? "qualquer categoria"}
                    {a.active ? "" : " · pausado"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <form action={toggleAlertFormAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={a.active ? "false" : "true"} />
                    <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm text-muted hover:bg-surface hover:text-text">
                      {a.active ? <BellOff className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
                      {a.active ? "Pausar" : "Ativar"}
                    </button>
                  </form>
                  <form action={removeAlertFormAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm text-danger hover:bg-surface">
                      <Trash2 className="size-4" aria-hidden /> Apagar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import { deleteChannelAction } from "@/app/actions/channels";
import { ChannelForm, NEW_CHANNEL, type ChannelValues } from "@/components/admin/channel-form";
import { requireAdmin } from "@/lib/auth";
import type { Channel } from "@/lib/dispatch/run";
import { db } from "@/lib/supabase/db";
import { supabaseEnabled } from "@/lib/supabase/server";

export const metadata = { title: "Painel: canais de envio" };
export const dynamic = "force-dynamic";

export default async function PanelChannelsPage() {
  await requireAdmin();
  if (!supabaseEnabled()) return <p className="mx-auto max-w-(--layout-max) px-4 py-8 text-sm text-muted">Precisa do Supabase configurado.</p>;
  const [channels, queue] = await Promise.all([
    db().from("channels").select("*").order("created_at"),
    db().from("dispatches").select("channel_id, status").in("status", ["queued", "failed"]),
  ]);
  const counts = new Map<string, { queued: number; failed: number }>();
  for (const r of (queue.data ?? []) as { channel_id: string; status: "queued" | "failed" }[]) {
    const c = counts.get(r.channel_id) ?? { queued: 0, failed: 0 };
    c[r.status]++;
    counts.set(r.channel_id, c);
  }
  const toValues = (c: Channel): ChannelValues => ({
    id: c.id, name: c.name, type: c.type, target: c.target, active: c.active, minVerdict: c.min_verdict, minDiscountPct: c.min_discount_bp / 100,
    windowStart: c.window_start.slice(0, 5), windowEnd: c.window_end.slice(0, 5), maxPerHour: c.max_per_hour, template: c.template, linkMode: c.link_mode,
    minIntervalMin: c.min_interval_min ?? null,
  });
  return (
    <div className="mx-auto flex max-w-(--layout-max) flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-bold">Canais de envio</h1>
        <p className="text-sm text-muted">
          Toda oferta que entra no ar e cumpre as regras do canal vai para a fila e sai uma por vez, dentro do horário e do limite por hora, com um intervalo entre uma mensagem e outra. Nunca repete a mesma oferta no mesmo canal.
          Ligue a integração do Telegram ou do WhatsApp em Integrações.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {((channels.data ?? []) as Channel[]).map((c) => {
          const n = counts.get(c.id);
          return (
            <li key={c.id} className="rounded-card bg-bg p-4 shadow-card">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold">{c.name}</span>
                  <span className={`rounded-pill px-2 py-0.5 text-xs font-bold ${c.active ? "bg-accent text-on-accent" : "bg-surface text-muted"}`}>{c.active ? "Ligado" : "Desligado"}</span>
                  <span className="text-sm text-muted">{c.type === "telegram" ? "Telegram" : "WhatsApp"} · {c.target} · {n?.queued ?? 0} na fila{n?.failed ? ` · ${n.failed} com falha` : ""}</span>
                </summary>
                <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                  <ChannelForm ch={toValues(c)} />
                  <form action={deleteChannelAction}><input type="hidden" name="id" value={c.id} /><button className="h-9 rounded-pill px-3 text-sm font-bold text-danger hover:bg-surface">Apagar canal</button></form>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <section aria-labelledby="novo" className="rounded-card bg-bg p-4 shadow-card">
        <h2 id="novo" className="mb-3 text-title font-bold">Novo canal</h2>
        <ChannelForm ch={NEW_CHANNEL} />
      </section>
    </div>
  );
}
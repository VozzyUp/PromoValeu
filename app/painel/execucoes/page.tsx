import { RunNow } from "@/components/admin/run-now";
import { requireAdmin } from "@/lib/auth";
import { newsletterCounts } from "@/lib/data/newsletter";
import { timeAgo } from "@/lib/format";
import { db } from "@/lib/supabase/db";
import { supabaseEnabled } from "@/lib/supabase/server";

export const metadata = { title: "Painel: execuções" };
export const dynamic = "force-dynamic";

type Run = { id: number; job: string; trigger: string; status: string; stats: Record<string, unknown>; error: string | null; started_at: string; finished_at: string | null };
const STATUS: Record<string, string> = { running: "Rodando", ok: "Ok", partial: "Parcial", error: "Erro", skipped: "Ignorada" };

export default async function PanelRunsPage() {
  await requireAdmin();
  if (!supabaseEnabled()) return <p className="mx-auto max-w-(--layout-max) px-4 py-8 text-sm text-muted">Precisa do Supabase configurado.</p>;
  const [runs, rules] = await Promise.all([
    db().from("job_runs").select("*").order("started_at", { ascending: false }).limit(100),
    db().from("robot_rules").select("id, name").order("name"),
  ]);
  const list = (runs.data ?? []) as Run[];
  const subs = await newsletterCounts().catch(() => null);
  return (
    <div className="mx-auto flex max-w-(--layout-max) flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-bold">Execuções</h1>
        <p className="text-sm text-muted">
          O agendador interno {process.env.WORKER_ENABLED === "1" ? "está ligado neste servidor." : "está desligado neste servidor (defina WORKER_ENABLED=1)."}
        </p>
      </div>
      <section aria-labelledby="agora" className="flex flex-col gap-2 rounded-card bg-bg p-4 shadow-card">
        <h2 id="agora" className="text-title font-bold">Rodar agora</h2>
        <RunNow job="expire" label="Expirar vencidas" />
        <RunNow job="recheck" label="Reconferir preços" />
        <RunNow job="watch" label="Gravar preço dos produtos acompanhados (histórico)" />
        <RunNow job="dispatch" label="Enviar para os canais" />
        <RunNow job="sync:shopee" label="Sincronizar vendas da Shopee" />
        <RunNow job="newsletter" label={`Enviar o boletim agora${subs ? ` (${subs.active} inscritos ativos, ${subs.pending} aguardando confirmação)` : ""}`} />
        {((rules.data ?? []) as { id: string; name: string }[]).map((r) => <RunNow key={r.id} job={`robot:${r.id}`} label={`Robô: ${r.name}`} />)}
      </section>
      <section aria-labelledby="hist">
        <h2 id="hist" className="mb-2 text-title font-bold">Últimas 100</h2>
        <ul className="divide-y divide-border rounded-card bg-bg shadow-card">
          {list.length === 0 ? <li className="p-4 text-sm text-muted">Nada executado ainda.</li> : null}
          {list.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 p-3 text-sm md:flex-row md:items-center md:justify-between">
              <span><strong>{r.job}</strong> · {STATUS[r.status] ?? r.status} · {r.trigger === "manual" ? "manual" : "agendada"} · {timeAgo(r.started_at)}</span>
              <span className={`min-w-0 break-words text-xs ${r.error ? "text-danger" : "text-muted"}`}>{r.error ?? JSON.stringify(r.stats)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
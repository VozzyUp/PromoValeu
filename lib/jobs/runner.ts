// Execução de jobs com trava (um por vez) e registro em job_runs. O agendador chama tick() a cada minuto.
import "server-only";
import { db } from "../supabase/db";
import { cronMatches } from "./cron";
import { JOBS, robotRuleJobs, sourceJob, type JobResult } from "./registry";

const STALE_MINUTES = 20; // um job "running" há mais tempo que isso é tratado como travado

export type RunOutcome = { status: "ok" | "partial" | "error" | "skipped"; stats: Record<string, unknown>; error?: string };

/** Roda um job se não houver outro igual em andamento. Nunca lança. */
export async function runJob(job: string, trigger: "schedule" | "manual"): Promise<RunOutcome> {
  const fn = job.startsWith("robot:") ? (await robotRuleJobs())[job] : job.startsWith("source:") ? sourceJob(job.slice(7)) : JOBS[job];
  if (!fn) return { status: "error", stats: {}, error: "Job desconhecido." };

  const since = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const running = await db().from("job_runs").select("id").eq("job", job).eq("status", "running").gte("started_at", since).limit(1);
  if (running.data && running.data.length > 0) return { status: "skipped", stats: {}, error: "Já está em execução." };

  const ins = await db().from("job_runs").insert({ job, trigger, status: "running" }).select("id").single();
  if (ins.error) return { status: "error", stats: {}, error: ins.error.message };
  const id = (ins.data as { id: number }).id;

  let out: RunOutcome;
  try {
    const r: JobResult = await fn();
    out = { status: r.partial ? "partial" : "ok", stats: r.stats };
  } catch (e) {
    out = { status: "error", stats: {}, error: e instanceof Error ? e.message.slice(0, 500) : "Falha desconhecida." };
    console.error(`[job ${job}]`, e);
  }
  const idle = job === "dispatch" && trigger === "schedule" && out.status === "ok" && Object.values(out.stats).every((v) => v === 0);
  if (idle) await db().from("job_runs").delete().eq("id", id); // rodada vazia a cada minuto não vale registro
  else await db().from("job_runs").update({ status: out.status, stats: out.stats, error: out.error ?? null, finished_at: new Date().toISOString() }).eq("id", id);
  return out;
}

type Due = { job: string; every?: number; at?: string };

/** Jobs fixos: a cada N minutos (relativo à hora cheia) ou por cron. */
const FIXED: Due[] = [
  { job: "dispatch", every: 1 },
  { job: "expire", every: 5 },
  { job: "recheck", every: 5 },
  { job: "watch", at: "20 * * * *" }, // de hora em hora; cada produto é lido no máximo a cada 11 h
  { job: "sync:shopee", at: "10 * * * *" },
  { job: "cleanup", at: "30 3 * * *" },
  { job: "newsletter", at: "0,15,30 9 * * 1" }, // segunda, 9h (Brasília); os 3 horários cobrem listas grandes, sem repetir quem já recebeu
];

export async function tick(now = new Date()): Promise<string[]> {
  const started: string[] = [];
  const minuteOfHour = now.getUTCMinutes();
  const due = FIXED.filter((d) => (d.every ? minuteOfHour % d.every === 0 : d.at ? cronMatches(d.at, now) : false)).map((d) => d.job);

  const rules = await db().from("robot_rules").select("id, cron, active").eq("active", true);
  for (const r of (rules.data ?? []) as { id: string; cron: string }[]) if (cronMatches(r.cron, now)) due.push(`robot:${r.id}`);

  // Fontes do Telegram (a tabela só existe depois da migração 8; sem ela, nada a fazer).
  const sources = await db().from("sources").select("id, cron").eq("active", true);
  for (const s of (sources.data ?? []) as { id: string; cron: string }[]) if (cronMatches(s.cron, now)) due.push(`source:${s.id}`);

  // Evita repetir na mesma janela de minuto (mais de uma réplica ou tick atrasado).
  const minuteStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  const recent = await db().from("job_runs").select("job").gte("started_at", minuteStart);
  const already = new Set(((recent.data ?? []) as { job: string }[]).map((r) => r.job));

  for (const job of due) {
    if (already.has(job)) continue;
    started.push(job);
    void runJob(job, "schedule");
  }
  return started;
}
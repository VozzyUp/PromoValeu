import { formatPrice } from "@/lib/format";
import type { HistoryPoint } from "@/lib/data/verification";

/** Linha simples do preço ao longo do tempo, com mínimo e máximo. Sem biblioteca de gráfico. */
export function PriceHistory({ points, storeOnly = false }: { points: HistoryPoint[]; storeOnly?: boolean }) {
  if (points.length < 2) return null;
  const W = 600, H = 120, P = 8;
  const t0 = new Date(points[0].at).getTime();
  const t1 = new Date(points[points.length - 1].at).getTime() || t0 + 1;
  const prices = points.map((p) => p.priceCents);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v: number) => (hi === lo ? H / 2 : H - P - ((v - lo) / (hi - lo)) * (H - 2 * P));
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(new Date(p.at).getTime()).toFixed(1)},${y(p.priceCents).toFixed(1)}`).join(" ");
  const days = Math.max(1, Math.round((t1 - t0) / 86400_000));
  return (
    <section aria-labelledby="hist-title" className="rounded-card bg-bg p-4 shadow-card md:p-6">
      <h2 id="hist-title" className="text-title font-bold">Histórico de preço</h2>
      <p className="mb-3 text-sm text-muted">
        {storeOnly
          ? `Preço normal na loja nos últimos ${days} dia(s), sem cupom nem desconto do Pix. O preço desta oferta vale com a condição informada.`
          : `Preços que registramos neste anúncio nos últimos ${days} dia(s).`}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="h-32 w-full" aria-label={`Preço entre ${formatPrice(lo)} e ${formatPrice(hi)}`}>
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => <circle key={i} cx={x(new Date(p.at).getTime())} cy={y(p.priceCents)} r="3" fill="var(--color-accent)" />)}
      </svg>
      <dl className="mt-2 flex gap-6 text-sm">
        <div><dt className="text-muted">Menor</dt><dd className="font-bold">{formatPrice(lo)}</dd></div>
        <div><dt className="text-muted">Maior</dt><dd className="font-bold">{formatPrice(hi)}</dd></div>
        <div><dt className="text-muted">Agora</dt><dd className="font-bold">{formatPrice(points[points.length - 1].priceCents)}</dd></div>
      </dl>
    </section>
  );
}
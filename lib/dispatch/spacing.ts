// Espaçamento da fila: tempo mínimo entre duas mensagens do mesmo canal, para não sair tudo de uma vez.

// A rodada é a cada 60 s e o envio leva alguns segundos: sem a folga, 3 min virariam 4.
const TOLERANCE_MS = 5000;

/** Intervalo entre mensagens: o que o canal definiu ou, se vazio, a hora dividida pelo limite por hora. */
export function minGapMs(maxPerHour: number, minIntervalMin: number | null | undefined): number {
  if (minIntervalMin != null && minIntervalMin > 0) return minIntervalMin * 60_000;
  return Math.floor(3600_000 / Math.max(1, maxPerHour));
}

/** Já passou o intervalo desde o último envio? Sem envio anterior, pode. */
export function canSendNow(lastSentAt: string | null | undefined, now: Date, gapMs: number): boolean {
  if (!lastSentAt) return true;
  const last = Date.parse(lastSentAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= gapMs - TOLERANCE_MS;
}

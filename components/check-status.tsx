import { CircleAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { checkBadge } from "@/lib/check-schedule";
import type { DealCheckInfo } from "@/lib/data/deal-check";

const TONE = { ok: "text-success", warn: "text-warning", muted: "text-muted" } as const;
const ICON = { ok: ShieldCheck, warn: CircleAlert, muted: ShieldQuestion } as const;

/** Última conferência do preço na loja e o que as pessoas disseram nas últimas 24 h. Só fatos, com hora. */
export function CheckStatus({ info }: { info: DealCheckInfo }) {
  const b = checkBadge(info.state, info.lastCheckedAt);
  const Icon = ICON[b.tone];
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className={`flex items-start gap-1.5 font-bold ${TONE[b.tone]}`}>
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{b.text}</span>
      </p>
      {info.worked > 0 || info.failed > 0 ? (
        <p className="text-muted">
          Nas últimas 24 h: {info.worked > 0 ? `${info.worked} ${info.worked === 1 ? "pessoa disse" : "pessoas disseram"} que funcionou` : ""}
          {info.worked > 0 && info.failed > 0 ? " · " : ""}
          {info.failed > 0 ? `${info.failed} que não funcionou` : ""}.
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { dealFeedbackAction } from "@/app/actions/check";

type Props = { dealId: string; code: string; hasCoupon: boolean };

const btn = "inline-flex h-9 items-center gap-1.5 rounded-pill border border-border px-3 text-sm font-bold hover:bg-surface disabled:opacity-60";

function read(key: string, store: "local" | "session"): string | null {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string, store: "local" | "session") {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    // sem armazenamento (aba anônima): só não lembra a resposta
  }
}

const noSubscribe = () => () => {};

/** "Funcionou pra você?" Aparece em destaque quando a pessoa volta da loja. Duas respostas "não" fazem o site conferir na hora. */
export function DealFeedback({ dealId, code, hasCoupon }: Props) {
  // Resposta já dada neste aparelho (lida só no navegador; no servidor fica vazia).
  const saved = useSyncExternalStore(noSubscribe, () => read(`fb:${dealId}`, "local"), () => null);
  const [choice, setChoice] = useState<"1" | "0" | null | undefined>(undefined);
  const answer = choice === undefined ? (saved === "1" || saved === "0" ? saved : null) : choice;
  const [back, setBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (a?.getAttribute("href")?.includes(`/ir/${code}`)) write(`went:${dealId}`, "1", "session");
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && read(`went:${dealId}`, "session")) setBack(true);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dealId, code]);

  const send = (worked: boolean) => {
    setError(null);
    start(async () => {
      const r = await dealFeedbackAction({ dealId, worked });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      const v = worked ? "1" : "0";
      write(`fb:${dealId}`, v, "local");
      setChoice(v);
    });
  };

  const question = hasCoupon ? "O cupom funcionou pra você?" : "O preço estava certo na loja?";
  return (
    <section
      aria-label="Funcionou pra você?"
      className={`flex flex-col gap-2 rounded-card border p-3 ${back && !answer ? "border-accent bg-surface" : "border-border"}`}
    >
      {answer ? (
        <p className="text-sm">
          {answer === "1" ? "Obrigado! Sua resposta ajuda quem vem depois." : "Obrigado! Vamos conferir o preço na loja agora."}{" "}
          <button type="button" className="font-bold text-accent underline" onClick={() => setChoice(null)}>Mudar resposta</button>
        </p>
      ) : (
        <>
          <p className="text-sm font-bold">{back ? `Voltou da loja? ${question}` : question}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={pending} onClick={() => send(true)}>
              <ThumbsUp className="size-4" aria-hidden /> Sim, funcionou
            </button>
            <button type="button" className={btn} disabled={pending} onClick={() => send(false)}>
              <ThumbsDown className="size-4" aria-hidden /> Não funcionou
            </button>
          </div>
        </>
      )}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </section>
  );
}

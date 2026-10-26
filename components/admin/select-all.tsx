"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const boxes = (form: string) =>
  Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="ids"][form="${form}"]`));

/** Marca ou desmarca de uma vez todas as caixas ligadas ao formulário do lote, e mostra quantas estão marcadas. */
export function SelectAll({ form }: { form: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [marked, setMarked] = useState(0);

  const sync = useCallback(() => {
    const all = boxes(form);
    const on = all.filter((b) => b.checked).length;
    setMarked(on);
    if (ref.current) {
      ref.current.checked = all.length > 0 && on === all.length;
      ref.current.indeterminate = on > 0 && on < all.length;
    }
  }, [form]);

  useEffect(() => {
    if (ref.current) ref.current.disabled = false; // só funciona depois que a página carregou o JavaScript
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, [sync]);

  return (
    <label className="flex items-center gap-2 text-sm font-bold">
      <input
        ref={ref}
        type="checkbox"
        disabled
        className="size-5"
        onChange={(e) => {
          for (const b of boxes(form)) b.checked = e.target.checked;
          sync();
        }}
      />
      Marcar todas
      <span className="font-normal text-muted" aria-live="polite">({marked} marcada{marked === 1 ? "" : "s"})</span>
    </label>
  );
}

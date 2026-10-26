"use client";

import { useActionState, useRef } from "react";
import { createAlertAction, type AlertState } from "@/app/actions/alerts";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";

export function AlertForm({ categories, initialKeyword = "" }: { categories: { id: string; name: string }[]; initialKeyword?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<AlertState, FormData>(async (prev, fd) => {
    const result = await createAlertAction(prev, fd);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, undefined);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      <Field label="O que você procura?" htmlFor="keyword" hint="Pode ser um produto, uma marca ou um modelo. Ex.: iphone 17">
        <Input id="keyword" name="keyword" required maxLength={60} defaultValue={initialKeyword} aria-describedby="keyword-hint" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preço máximo (opcional)" htmlFor="maxPrice" hint="Só avisa se a oferta custar até esse valor.">
          <Input id="maxPrice" name="maxPrice" inputMode="decimal" placeholder="1500,00" aria-describedby="maxPrice-hint" />
        </Field>
        <Field label="Categoria (opcional)" htmlFor="categoryId">
          <Select id="categoryId" name="categoryId" defaultValue="">
            <option value="">Qualquer categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      {state?.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">Alerta criado. Você recebe um aviso no sininho do topo quando aparecer uma oferta assim.</FormMessage> : null}
      <div><Button type="submit" loading={pending}>Criar alerta</Button></div>
    </form>
  );
}

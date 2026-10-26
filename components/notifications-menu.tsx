"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { markNotificationsReadAction } from "@/app/actions/notifications";

export type MenuNotification = { id: number; text: string; href: string; read: boolean; when: string };

/** Avisos: painel com as últimas notificações. Abrir o painel marca tudo como lido. */
export function NotificationsMenu({ unread, items }: { unread: number; items: MenuNotification[] }) {
  const [seenFor, setSeenFor] = useState<number | null>(null);
  const count = seenFor === unread ? 0 : unread;

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (open && unread > 0) {
          setSeenFor(unread);
          void markNotificationsReadAction();
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `Notificações: ${count} não lidas` : "Notificações"}
          className="relative flex items-center gap-1.5 rounded-pill px-2 py-1.5 text-sm font-bold hover:bg-surface"
        >
          <Bell className="size-4" aria-hidden />
          <span className="hidden lg:inline">Avisos</span>
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-pill bg-accent px-1 text-[10px] font-bold leading-4 text-on-accent">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-card bg-bg p-2 shadow-card-hover"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="font-bold">Notificações</p>
            <DropdownMenu.Item asChild>
              <Link href="/conta/notificacoes" className="rounded-sm px-2 py-1 text-sm font-bold text-accent outline-none data-[highlighted]:bg-surface">
                Ver todas
              </Link>
            </DropdownMenu.Item>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Por enquanto você não tem notificações.</p>
          ) : (
            items.map((n) => (
              <DropdownMenu.Item key={n.id} asChild>
                <Link href={n.href} className="flex gap-2 rounded-sm px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-pill ${n.read ? "bg-transparent" : "bg-accent"}`} aria-hidden />
                  <span className="min-w-0">
                    <span className={`block ${n.read ? "text-muted" : "font-bold"}`}>{n.text}</span>
                    <span className="text-xs text-muted">{n.when}</span>
                  </span>
                </Link>
              </DropdownMenu.Item>
            ))
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

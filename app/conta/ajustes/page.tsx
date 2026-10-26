import Link from "next/link";
import { removeRelationFormAction } from "@/app/actions/social";
import { PrefsForm } from "@/components/forms/prefs-form";
import { AvatarForm, BioForm, DeleteAccountForm, EmailForm, PasswordForm, UsernameForm } from "@/components/forms/profile-forms";
import { requireUser } from "@/lib/auth";
import { getAccountInfo } from "@/lib/data/account";
import { listRelations, type RelationItem } from "@/lib/data/relations";
import { getPrefs } from "@/lib/data/social";
import { fullDate } from "@/lib/format";
import { supabaseAuth } from "@/lib/supabase/server";

export const metadata = { title: "Ajustes" };

const TABS = [
  { id: "perfil", label: "Perfil" },
  { id: "preferencias", label: "Preferências" },
  { id: "notificacoes", label: "Notificações" },
  { id: "seguindo", label: "Seguindo e ignorados" },
  { id: "conta", label: "Conta" },
] as const;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-bg p-4 shadow-card md:p-6">
      <h2 className="mb-3 text-title font-bold">{title}</h2>
      {children}
    </section>
  );
}

function PeopleList({ title, empty, items }: { title: string; empty: string; items: RelationItem[] }) {
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <Link href={`/u/${p.username}`} className="font-bold hover:text-accent">@{p.username}</Link>
              <form action={removeRelationFormAction}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="rounded-pill border border-border px-3 py-1.5 text-sm hover:bg-surface">Desfazer</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/conta/ajustes">) {
  const session = await requireUser("/conta/ajustes");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.aba)?.id ?? "perfil";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Ajustes</h1>
      <nav aria-label="Seções dos ajustes" className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/conta/ajustes?aba=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={`shrink-0 rounded-pill px-4 py-1.5 text-sm ${t.id === tab ? "bg-surface font-bold" : "text-muted hover:bg-surface"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "perfil" ? <ProfileTab userId={session.userId} /> : null}
      {tab === "preferencias" ? <PrefsTab userId={session.userId} /> : null}
      {tab === "notificacoes" ? <NotifyTab userId={session.userId} /> : null}
      {tab === "seguindo" ? <FollowingTab userId={session.userId} /> : null}
      {tab === "conta" ? <AccountTab userId={session.userId} /> : null}
    </div>
  );
}

async function ProfileTab({ userId }: { userId: string }) {
  const info = await getAccountInfo(userId);
  if (!info) return null;
  return (
    <div className="flex flex-col gap-4">
      <Card title="Foto"><AvatarForm avatarUrl={info.avatarUrl} name={info.displayName} /></Card>
      <Card title="Descrição"><BioForm bio={info.bio} /></Card>
      <Card title="Nome de usuário">
        <UsernameForm username={info.username} blockedUntil={info.usernameChangeBlockedUntil ? fullDate(info.usernameChangeBlockedUntil) : null} />
      </Card>
    </div>
  );
}

async function PrefsTab({ userId }: { userId: string }) {
  const prefs = await getPrefs(userId);
  return (
    <div className="flex flex-col gap-4">
      <Card title="Feed e lateral"><PrefsForm section="feed" prefs={prefs} /></Card>
      <Card title="Privacidade"><PrefsForm section="privacy" prefs={prefs} /></Card>
    </div>
  );
}

async function NotifyTab({ userId }: { userId: string }) {
  const prefs = await getPrefs(userId);
  return (
    <Card title="Quando você quer ser avisado"><PrefsForm section="notify" prefs={prefs} /></Card>
  );
}

async function FollowingTab({ userId }: { userId: string }) {
  const [following, ignored] = await Promise.all([listRelations(userId, "follow"), listRelations(userId, "ignore")]);
  return (
    <div className="flex flex-col gap-4">
      <PeopleList title="Quem você segue" empty="Você ainda não segue ninguém. O botão Seguir fica no perfil de cada pessoa." items={following} />
      <PeopleList title="Quem você ignora" empty="Você não ignora ninguém. As ofertas de quem você ignora deixam de aparecer no seu feed." items={ignored} />
    </div>
  );
}

async function AccountTab({ userId }: { userId: string }) {
  const [info, auth] = await Promise.all([getAccountInfo(userId), supabaseAuth().then((s) => s.auth.getUser())]);
  if (!info) return null;
  return (
    <div className="flex flex-col gap-4">
      <Card title="E-mail"><EmailForm current={auth.data.user?.email ?? ""} /></Card>
      <Card title="Senha"><PasswordForm /></Card>
      <Card title="Seus dados">
        <p className="mb-3 text-sm text-muted">Baixe uma cópia de tudo o que guardamos sobre a sua conta: perfil, ofertas, comentários, votos, alertas e preferências.</p>
        <a href="/conta/exportar" download className="inline-flex h-10 items-center rounded-pill border border-border px-4 text-sm font-bold hover:bg-surface">
          Baixar meus dados
        </a>
      </Card>
      <Card title="Apagar conta"><DeleteAccountForm username={info.username} /></Card>
    </div>
  );
}

import Link from "next/link";
import { DealCard } from "@/components/deal-card";
import { FeedMore } from "@/components/feed-more";
import { AdSlot, CategoriesWidget, CouponsWidget, EmptyState, HotSidebar } from "@/components/sidebar";
import { ButtonLink } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { listHot } from "@/lib/data";
import { listCouponDeals, listFeedPage, listPopularCategories } from "@/lib/data/feed";
import { savedSet } from "@/lib/data/relations";
import { getPrefs } from "@/lib/data/social";
import { DEFAULT_PREFS } from "@/lib/prefs";
import type { FeedTab } from "@/lib/types";

// A página inicial abre com abas e filtros (?aba=...): para o Google é sempre o mesmo endereço.
export const metadata = { alternates: { canonical: "/" } };

const ALL_TABS: { id: FeedTab; label: string; loggedOnly?: boolean }[] = [
  { id: "paravoce", label: "Pra você", loggedOnly: true },
  { id: "quentes", label: "Mais quentes" },
  { id: "descontos", label: "Maiores descontos" },
  { id: "novas", label: "Novas" },
];

const AD_EVERY = 4;

const SECTION_TITLE: Record<FeedTab, string> = {
  paravoce: "Ofertas para você",
  quentes: "Ofertas mais quentes",
  descontos: "Maiores descontos verificados",
  novas: "Ofertas novas",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const session = await getSession();
  const prefs = session ? await getPrefs(session.userId) : DEFAULT_PREFS;
  const tabs = ALL_TABS.filter((t) => !t.loggedOnly || session);
  const tab = (tabs.find((t) => t.id === sp.aba)?.id ?? tabs.find((t) => t.id === prefs.home_tab)?.id ?? "quentes") as FeedTab;
  const viewerId = session?.userId ?? null;

  const [{ items, nextOffset }, hot, categories, coupons] = await Promise.all([
    listFeedPage({ tab, viewerId, limit: 20 }),
    prefs.widgets.hot ? listHot(4, viewerId) : Promise.resolve([]),
    prefs.widgets.categories ? listPopularCategories(8) : Promise.resolve([]),
    prefs.widgets.coupons ? listCouponDeals(4) : Promise.resolve([]),
  ]);
  const saved = session ? await savedSet(session.userId, items.map((d) => d.id)) : new Set<string>();

  return (
    <div className="mx-auto max-w-(--layout-max) px-4">
      <section className="sr-only md:not-sr-only md:pb-2 md:pt-10">
        <h1 className="text-xl font-bold md:text-display">Promoção de verdade, aprovada por quem compra</h1>
        <p className="mt-2 text-base text-muted md:text-title md:font-normal">
          Ofertas e cupons publicados pela comunidade, com o desconto real conferido.
        </p>
      </section>

      <nav aria-label="Ordenar ofertas" className="sticky top-[calc(var(--header-top)+var(--header-nav))] z-30 -mx-4 mb-3 flex gap-6 overflow-x-auto border-b border-border bg-bg px-4 md:mt-4">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/?aba=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={`shrink-0 border-b-2 py-3 text-sm font-bold ${t.id === tab ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-(--layout-main)">
          <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-muted">{SECTION_TITLE[tab]}</h2>
          <AdSlot minHeight={120} />
          {items.length === 0 ? (
            <EmptyState
              title={tab === "descontos" ? "Nenhuma oferta verificada ainda" : tab === "paravoce" ? "Ainda não temos o que sugerir" : "Nada por aqui ainda"}
            >
              <p className="text-sm text-muted">
                {tab === "paravoce"
                  ? "Vote em algumas ofertas e siga quem publica coisa boa. A gente aprende o que você curte."
                  : "Achou uma promoção boa? Seja a primeira pessoa a publicar."}
              </p>
              <ButtonLink href="/publicar">Publicar oferta</ButtonLink>
            </EmptyState>
          ) : (
            items.map((deal, i) => (
              <div key={deal.id} className="contents">
                <DealCard deal={deal} loggedIn={!!session} saved={saved.has(deal.id)} />
                {(i + 1) % AD_EVERY === 0 ? <AdSlot /> : null}
              </div>
            ))
          )}
          <FeedMore key={tab} tab={tab} startOffset={nextOffset} infinite={prefs.infinite_scroll} />
        </div>
        <div className="flex w-full flex-col gap-4 lg:sticky lg:top-[calc(var(--header-top)+var(--header-nav)+16px)] lg:w-(--layout-aside) lg:shrink-0">
          <HotSidebar deals={hot} />
          <CouponsWidget deals={coupons} />
          <CategoriesWidget categories={categories} />
          <AdSlot minHeight={600} format="vertical" className="hidden lg:block" />
        </div>
      </div>
    </div>
  );
}

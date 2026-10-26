import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, Info } from "lucide-react";
import { CouponCTA } from "@/components/coupon-cta";
import { ActionBar, AuthorCard, CommentSaveBar, DealImage, ExpiryBanner, GoToDealLink, PriceBlock, SponsoredChip, TimeChip } from "@/components/deal-parts";
import { TemperatureVote } from "@/components/temperature-vote";
import { AdSlot } from "@/components/sidebar";
import { FormMessage } from "@/components/ui/field";
import { getDealBySlug } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { CommentSection } from "@/components/comments/comment-section";
import { DealToolbar } from "@/components/deal-toolbar";
import { isSubscribed, listComments } from "@/lib/data/comments";
import { savedSet } from "@/lib/data/relations";
import { formatPrice, isFuture } from "@/lib/format";
import { DealGallery } from "@/components/deal-gallery";
import { listDealGallery } from "@/lib/data/publish";
import { supabaseEnabled } from "@/lib/supabase/server";
import { RichText } from "@/lib/rich-text";
import { PriceHistory } from "@/components/price-history";
import { dealJsonLd, jsonLdScript } from "@/lib/structured-data";
import { RelatedDeals } from "@/components/related-deals";
import { StickyDealCta } from "@/components/sticky-deal-cta";
import { listDeals } from "@/lib/data/browse";
import { getProfile } from "@/lib/data";
import { getPriceHistory, listSameProductDeals } from "@/lib/data/verification";
import { SameProductDeals } from "@/components/same-product-deals";

export async function generateMetadata({ params }: PageProps<"/oferta/[slug]">) {
  const { slug } = await params;
  const session = await getSession();
  const deal = await getDealBySlug(slug, session ? { id: session.userId, role: session.role } : null);
  if (!deal) return { title: "Oferta não encontrada" };
  // Prévia ao compartilhar (WhatsApp, Telegram, redes): foto do produto, preço e loja.
  const price = deal.priceCents != null ? formatPrice(deal.priceCents) : deal.couponCode ? `cupom ${deal.couponCode}` : null;
  const description = [price, deal.store.name].filter(Boolean).join(" · ") + (deal.description ? `. ${deal.description.replace(/\s+/g, " ").slice(0, 140)}` : "");
  const url = `/oferta/${deal.slug}`;
  return {
    title: deal.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: price ? `${deal.title} por ${price}` : deal.title, description, images: [deal.imageUrl ? { url: deal.imageUrl, alt: deal.title } : "/opengraph-image"] },
    twitter: { card: deal.imageUrl ? "summary_large_image" : "summary" },
    robots: deal.status === "published" || deal.status === "expired" ? undefined : { index: false },
  };
}

export default async function DealPage({ params, searchParams }: PageProps<"/oferta/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const deal = await getDealBySlug(slug, session ? { id: session.userId, role: session.role } : null);
  if (!deal) notFound();

  const db = supabaseEnabled();
  const expired = deal.status === "expired";
  const live = deal.status === "published" || expired;
  // Tudo de uma vez: cada consulta vai até o banco, e uma depois da outra a página levava mais de 1 segundo.
  const [history, related, author, sameProduct, thread, subscribed, saved, gallery] = await Promise.all([
    db ? getPriceHistory(deal.id).catch(() => []) : Promise.resolve([]),
    // Ofertas parecidas (mesma categoria, as mais quentes) e dados do autor: só com o banco de verdade.
    db ? listDeals({ viewerId: null, tab: "quentes", page: 1, categoryId: deal.category?.id }).then((r) => r.items.filter((d) => d.id !== deal.id).slice(0, 4)).catch(() => []) : Promise.resolve([]),
    db && deal.authorId ? getProfile(deal.authorId).catch(() => null) : Promise.resolve(null),
    db ? listSameProductDeals(deal.id).catch(() => []) : Promise.resolve([]),
    live ? listComments({ dealId: deal.id }, session?.userId ?? null, sp.ordem === "novos" ? "desc" : "asc") : Promise.resolve(null),
    live && session ? isSubscribed(deal.id, session.userId) : Promise.resolve(false),
    session ? savedSet(session.userId, [deal.id]).then((set) => set.has(deal.id)) : Promise.resolve(false),
    db ? listDealGallery(deal.id) : Promise.resolve([]),
  ]);
  const jsonLd = dealJsonLd(deal, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  const canClose = !!session && (session.userId === deal.authorId || session.role === "admin" || session.role === "moderator");
  return (
    <div className="mx-auto flex max-w-(--layout-max) flex-col gap-4 px-4 py-4">
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} /> : null}
      <nav aria-label="Trilha" className="flex items-center gap-1 text-sm text-muted">
        <Link href="/" className="hover:text-text">Início</Link>
        {deal.category ? (
          <>
            <ChevronRight className="size-3" aria-hidden />
            <Link href={`/c/${deal.category.slug}`} className="hover:text-text">{deal.category.name}</Link>
          </>
        ) : null}
      </nav>

      {sp.enviada && deal.status === "pending" ? (
        <FormMessage tone="info">
          Recebemos sua oferta. Ela aparece para todos assim que a moderação aprovar. Depois de algumas ofertas aprovadas,
          as suas passam a sair na hora.
        </FormMessage>
      ) : null}
      {sp.enviada && deal.status === "published" ? <FormMessage tone="success">Sua oferta está no ar.</FormMessage> : null}
      {deal.status === "rejected" ? <FormMessage>Esta oferta não foi aprovada{deal.rejectReason ? `: ${deal.rejectReason}` : "."}</FormMessage> : null}

      <article aria-labelledby="deal-title" className="-mx-4 flex flex-col gap-4 border-y border-border bg-bg p-4 sm:mx-0 sm:rounded-card sm:border-0 sm:shadow-card md:p-6">
        {deal.expiresAt ? <ExpiryBanner iso={deal.expiresAt} /> : null}
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="md:w-80 md:shrink-0">
            {gallery.length > 1 ? <DealGallery images={gallery} title={deal.title} /> : <DealImage deal={deal} size="page" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {deal.status === "published" ? (
                <TemperatureVote dealId={deal.id} initial={{ temperature: deal.temperature, myVote: deal.myVote }} loggedIn={!!session} />
              ) : (
                <span className="rounded-pill bg-surface px-3 py-1.5 text-sm font-bold text-muted">
                  {deal.status === "pending" ? "Aguardando moderação" : expired ? "Acabou" : "Fora do ar"}
                </span>
              )}
              <ActionBar deal={deal} saved={saved} loggedIn={!!session} />
            </div>
            {deal.publishedAt ? (
              <div className="flex flex-wrap items-center gap-2">
                {deal.isSponsored ? <SponsoredChip /> : null}
                <TimeChip iso={deal.publishedAt} />
              </div>
            ) : null}
            <h1 id="deal-title" className="text-xl font-bold">{deal.title}</h1>
            <PriceBlock deal={deal} size="page" />
            <p className="text-sm text-muted">
              Disponível em <strong className="text-text">{deal.store.name}</strong>
              {deal.availability === "offline" ? " · loja física" : ""}
              {deal.shipsFrom ? ` · ${deal.availability === "offline" ? "" : "enviado de "}${deal.shipsFrom}` : ""}
              {deal.shippingCents != null ? ` · ${deal.shippingCents === 0 ? "frete grátis" : `frete ${(deal.shippingCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}` : ""}
            </p>
            {deal.startsAt && isFuture(deal.startsAt) ? (
              <p className="text-sm font-bold text-warning">Começa em {new Date(deal.startsAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}</p>
            ) : null}
            {deal.couponCode ? (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold">Código do cupom</span>
                <code className="w-fit rounded-sm border-2 border-dashed border-border-input px-3 py-2 font-mono text-base">{deal.couponCode}</code>
              </div>
            ) : null}
            <div className="mt-2" id="deal-cta">
              {expired || deal.status !== "published" ? null : deal.couponCode ? (
                <CouponCTA code={deal.code} couponCode={deal.couponCode} size="lg" />
              ) : (
                <GoToDealLink code={deal.code} size="lg" />
              )}
            </div>
          </div>
        </div>
      </article>

      {deal.status === "published" ? (
        <section className="-mx-4 flex flex-col gap-3 border-y border-border bg-bg p-4 sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-card sm:border-0 sm:shadow-card md:p-6">
          <p className="text-title font-bold">Vale a pena? Seu voto ajuda outros caçadores a decidir.</p>
          <TemperatureVote dealId={deal.id} initial={{ temperature: deal.temperature, myVote: deal.myVote }} loggedIn={!!session} />
        </section>
      ) : null}

      <PriceHistory points={history} />

      <AdSlot minHeight={120} />

      <section aria-labelledby="sobre-title" className="-mx-4 flex flex-col gap-4 border-y border-border bg-bg p-4 sm:mx-0 sm:rounded-card sm:border-0 sm:shadow-card md:p-6">
        <h2 id="sobre-title" className="text-title font-bold">{deal.couponCode && deal.priceCents == null ? "Sobre este cupom" : "Sobre esta oferta"}</h2>
        <AuthorCard author={deal.author} profile={author} />
        {deal.description ? <RichText text={deal.description} className="text-base" /> : <p className="text-sm text-muted">O autor não deixou detalhes.</p>}
        {deal.status === "published" ? (
          <DealToolbar dealId={deal.id} hasCoupon={!!deal.couponCode} canClose={canClose} loggedIn={!!session} />
        ) : null}
        {deal.status === "published" ? <CommentSaveBar dealId={deal.id} saved={saved} loggedIn={!!session} /> : null}
        <a href={`/ir/${deal.code}`} target="_blank" rel="sponsored noopener" className="flex w-fit items-center gap-1.5 text-sm font-bold text-accent">
          Ver na {deal.store.name} <ExternalLink className="size-4" aria-hidden /><span className="sr-only">(abre em nova aba)</span>
        </a>
        <p className="flex gap-2 border-t border-border pt-4 text-xs italic text-muted">
          <Info className="size-4 shrink-0" aria-hidden />
          Alguns links nos pagam comissão, ou pagam ao autor da oferta, quando você compra. Isso não muda o que aparece aqui.
        </p>
      </section>

      <SameProductDeals current={deal} others={sameProduct} />

      <RelatedDeals deals={related} />

      {deal.status === "published" && !expired ? (
        <StickyDealCta>
          {deal.couponCode ? <CouponCTA code={deal.code} couponCode={deal.couponCode} /> : <GoToDealLink code={deal.code} />}
        </StickyDealCta>
      ) : null}

      {thread ? (
        <CommentSection
          dealId={deal.id}
          basePath={`/oferta/${deal.slug}`}
          comments={thread.comments}
          total={thread.total}
          order={sp.ordem === "novos" ? "desc" : "asc"}
          loggedIn={!!session}
          viewerId={session?.userId ?? null}
          viewerRole={session?.role ?? null}
          subscribed={subscribed}
        />
      ) : null}
      <div id="page-end" className="h-px" aria-hidden />
    </div>
  );
}

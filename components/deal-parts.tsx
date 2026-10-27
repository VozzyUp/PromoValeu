// Peças pequenas do card e da página de oferta.
import { BadgeCheck, CircleHelp, Clock, ExternalLink, MessageSquare, MessageSquarePlus, ShieldCheck, Tag } from "lucide-react";
import Link from "next/link";
import { SaveButton } from "@/components/save-button";
import { ShareButton } from "@/components/share-button";
import { discountPercent, endsWithinHours, formatPrice, fullDate, timeAgo } from "@/lib/format";
import type { DealView, Verdict } from "@/lib/types";

export function DealImage({ deal, size = "card" }: { deal: Pick<DealView, "imageUrl" | "title" | "store">; size?: "card" | "page" | "mini" }) {
  const dims = size === "page" ? "mx-auto size-72 max-w-full md:size-full md:min-h-64" : size === "mini" ? "size-[100px]" : "size-24 sm:size-(--card-image)";
  if (deal.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- trocar por next/image quando o storage existir
    return <img src={deal.imageUrl} alt={deal.title} className={`${dims} rounded-xs object-contain`} />;
  }
  // Sem imagem: no celular a página mostra só um cartão pequeno com o nome da loja, não um quadrado enorme.
  const blank = size === "page" ? "mx-auto size-40 max-w-full md:size-full md:min-h-64" : dims;
  const logo = deal.store.logoUrl;
  return (
    <div className={`${blank} grid place-items-center overflow-hidden rounded-xs bg-surface text-center`} role="img" aria-label={`Sem imagem: ${deal.title}`}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo pequeno vindo do cadastro da loja
        <img src={logo} alt="" className="max-h-[60%] max-w-[70%] object-contain" />
      ) : (
        <span className="px-2 text-sm font-bold text-muted">{deal.store.name}</span>
      )}
    </div>
  );
}

export function TimeChip({ iso, prefix = "Publicado" }: { iso: string; prefix?: string }) {
  return (
    <time dateTime={iso} title={fullDate(iso)} className="whitespace-nowrap rounded-sm bg-surface px-2 py-1 text-xs text-muted sm:text-sm">
      {prefix} {timeAgo(iso)}
    </time>
  );
}

export function SponsoredChip() {
  return (
    <span className="rounded-sm bg-info-soft px-2 py-1 text-xs font-bold text-info sm:text-sm" title="Um anunciante pagou para esta oferta aparecer aqui. O desconto continua sendo conferido do mesmo jeito.">
      Patrocinada
    </span>
  );
}

export function PriceBlock({ deal, size = "card" }: { deal: DealView; size?: "card" | "page" }) {
  if (deal.priceCents == null) {
    return deal.couponPercent ? (
      <span className={`${size === "page" ? "text-xl" : "text-price"} font-bold text-price`}>-{deal.couponPercent}%</span>
    ) : null;
  }
  const inflated = deal.verdict === "inflated";
  const pct = deal.realDiscountBp != null ? Math.round(deal.realDiscountBp / 100) : discountPercent(deal.priceCents, deal.listPriceCents);
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className={`${size === "page" ? "text-xl" : "text-price"} font-bold text-price`}>{formatPrice(deal.priceCents)}</span>
      {deal.listPriceCents && !inflated ? (
        <s className="text-sm text-muted"><span className="sr-only">preço anterior </span>{formatPrice(deal.listPriceCents)}</s>
      ) : null}
      {pct && pct > 0 ? <DiscountChip pct={pct} /> : null}
      <VerifyBadge verdict={deal.verdict} />
    </div>
  );
}

export function DiscountChip({ pct }: { pct: number }) {
  return <span className="rounded-xs bg-price-soft px-1.5 py-0.5 text-sm font-bold text-price">-{pct}%</span>;
}

const verdicts: Partial<Record<Verdict, { label: string; tip: string; className: string; Icon: typeof BadgeCheck }>> = {
  verified: { label: "Desconto verificado", tip: "Está no menor preço que registramos nos últimos 30 dias, com pelo menos 10% abaixo do preço de costume.", className: "text-price", Icon: BadgeCheck },
  good_price: { label: "Bom preço", tip: "Está abaixo do preço de costume ou do preço do mesmo produto em outra loja.", className: "text-info", Icon: Tag },
  inflated: { label: "Desconto inflado", tip: "O preço anterior informado está bem acima do que o produto costuma custar, aqui ou em outra loja; o desconto real é pequeno.", className: "text-danger", Icon: CircleHelp },
  no_comparison: { label: "Sem comparação", tip: "Ainda não temos histórico suficiente deste produto para comparar.", className: "text-muted", Icon: CircleHelp },
};

export function VerifyBadge({ verdict }: { verdict: Verdict }) {
  const v = verdicts[verdict];
  if (!v) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-bold ${v.className}`} title={v.tip}>
      <v.Icon className="size-4" aria-hidden /> {v.label}
    </span>
  );
}

export function StoreAndAuthor({ deal }: { deal: DealView }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span>Disponível em <strong className="text-text">{deal.store.name}</strong></span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-pill bg-surface text-xs font-bold" aria-hidden>
          {deal.author.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate">Postado por {deal.author.username}</span>
      </span>
    </p>
  );
}

export function ActionBar({ deal, saved = false, loggedIn = false }: { deal: DealView; saved?: boolean; loggedIn?: boolean }) {
  return (
    <div className="flex items-center gap-1 text-sm text-muted">
      <a href={`/oferta/${deal.slug}#comentarios`} className="flex h-9 items-center gap-1 rounded-sm px-2 hover:bg-surface">
        <MessageSquare className="size-4" aria-hidden /> {deal.commentsCount}
        <span className="sr-only">comentários</span>
      </a>
      <ShareButton path={`/oferta/${deal.slug}`} title={deal.title} />
      <SaveButton dealId={deal.id} saved={saved} loggedIn={loggedIn} />
    </div>
  );
}

export function ExpiryBanner({ iso }: { iso: string }) {
  const soon = endsWithinHours(iso, 24);
  return (
    <p className={`flex items-center justify-center gap-2 rounded-sm px-4 py-3 text-sm ${soon ? "bg-bg text-danger" : "bg-info-soft text-info"}`}>
      <Clock className="size-4" aria-hidden /> Vence {fullDate(iso)}
    </p>
  );
}

export function GoToDealLink({ code, size = "md" }: { code: string; size?: "md" | "lg" }) {
  return (
    <a
      href={`/ir/${code}`}
      target="_blank"
      rel="sponsored noopener"
      className={`inline-flex items-center justify-center gap-2 rounded-pill bg-accent px-6 font-bold text-on-accent hover:bg-accent-hover ${size === "lg" ? "h-14 w-full text-base" : "h-10 w-full text-sm sm:w-auto"}`}
    >
      Ir para a oferta <ExternalLink className="size-4" aria-hidden />
      <span className="sr-only">(abre em nova aba)</span>
    </a>
  );
}

const ROLE_BADGE: Record<string, string> = { admin: "Equipe", moderator: "Moderação" };

/** Quem postou: avatar, insígnia (equipe, moderação ou autor de confiança) e contadores. */
export function AuthorCard({ author, profile }: {
  author: DealView["author"];
  profile: { createdAt: string; approvedPosts: number; reputation: number; trusted: boolean } | null;
}) {
  const badge = ROLE_BADGE[author.role] ?? (profile?.trusted ? "Autor de confiança" : null);
  return (
    <div className="flex items-center gap-3">
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar pequeno vindo do perfil
        <img src={author.avatarUrl} alt="" className="size-12 rounded-pill object-cover" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-accent-soft text-title font-bold text-accent" aria-hidden>
          {author.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <Link href={`/u/${author.username}`} className="truncate font-bold hover:text-accent">{author.username}</Link>
          {badge ? (
            <span className="inline-flex items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">
              <ShieldCheck className="size-3" aria-hidden /> {badge}
            </span>
          ) : null}
        </span>
        {profile ? (
          <span className="text-muted">
            Membro desde {new Date(profile.createdAt).getFullYear()} · {profile.approvedPosts} {profile.approvedPosts === 1 ? "oferta aprovada" : "ofertas aprovadas"} · reputação {profile.reputation}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Barra no fim do bloco da oferta: ir comentar ou guardar. */
export function CommentSaveBar({ dealId, saved, loggedIn }: { dealId: string; saved: boolean; loggedIn: boolean }) {
  return (
    <div className="flex divide-x divide-border rounded-card border border-border">
      <a href="#comentarios" className="flex h-10 flex-1 items-center justify-center gap-2 rounded-sm text-sm font-bold text-muted hover:bg-surface">
        <MessageSquarePlus className="size-4" aria-hidden /> Novo comentário
      </a>
      <SaveButton dealId={dealId} saved={saved} loggedIn={loggedIn} labeled />
    </div>
  );
}

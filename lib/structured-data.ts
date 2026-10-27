// Dados estruturados (schema.org) da oferta, para o Google mostrar preço e disponibilidade.
import type { DealView } from "./types";

const RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "BR",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: 7,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/FreeReturn",
};

function shipping(cents: number) {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: (cents / 100).toFixed(2), currency: "BRL" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "BR" },
  };
}

export function dealJsonLd(deal: DealView, siteUrl: string, now = new Date()): Record<string, unknown> | null {
  if (deal.priceCents == null || deal.status === "pending" || deal.status === "rejected" || deal.status === "removed") return null;
  const validFrom = deal.startsAt ?? deal.publishedAt;
  const expired = deal.status === "expired" || (!!deal.expiresAt && new Date(deal.expiresAt).getTime() < now.getTime());
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: deal.title,
    ...(deal.imageUrl ? { image: [deal.imageUrl] } : {}),
    ...(deal.description ? { description: deal.description.replace(/\s+/g, " ").slice(0, 300) } : {}),
    offers: {
      "@type": "Offer",
      url: `${siteUrl.replace(/\/$/, "")}/oferta/${deal.slug}`,
      priceCurrency: "BRL",
      price: (deal.priceCents / 100).toFixed(2),
      availability: expired ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      ...(validFrom ? { validFrom } : {}),
      ...(deal.expiresAt ? { priceValidUntil: deal.expiresAt.slice(0, 10) } : {}),
      ...(deal.shippingCents != null ? { shippingDetails: shipping(deal.shippingCents) } : {}),
      // Compra pela internet no Brasil: o Código de Defesa do Consumidor (art. 49) garante 7 dias para desistir.
      ...(deal.availability !== "offline" ? { hasMerchantReturnPolicy: RETURN_POLICY } : {}),
      seller: { "@type": "Organization", name: deal.store.name },
    },
  };
}

/** JSON seguro para ir dentro de uma tag script: nada de "<" que feche a tag. */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, " ");
}
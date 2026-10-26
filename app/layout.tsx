import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { BfBanner } from "@/components/bf-banner";
import { BottomNav } from "@/components/bottom-nav";
import { AdScript } from "@/components/consent/ad-script";
import { AdLayoutStyles } from "@/components/consent/ad-layout";
import { AdsProvider } from "@/components/consent/ads-context";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { SideRails } from "@/components/consent/side-rails";
import { Footer } from "@/components/footer";
import type { MenuNotification } from "@/components/notifications-menu";
import { getSession } from "@/lib/auth";
import { newsletterAvailable } from "@/lib/data/newsletter";
import { listCategories, listMenuStores } from "@/lib/data";
import { getAdsSettings, getBrandSettings } from "@/lib/data/settings";
import { countUnread, listNotifications } from "@/lib/data/social";
import { timeAgo } from "@/lib/format";
import { describeNotification } from "@/lib/notifications";
import { supabaseEnabled } from "@/lib/supabase/server";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandSettings();
  return {
    title: { default: `${brand.siteName}: ofertas que valem a pena compartilhar`, template: `%s | ${brand.siteName}` },
    description: brand.description,
    // Base dos links absolutos (prévia ao compartilhar, canônico). Sempre o endereço com www.
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    openGraph: { siteName: brand.siteName, locale: "pt_BR", type: "website" },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  let unread = 0;
  let notifications: MenuNotification[] = [];
  if (session && supabaseEnabled()) {
    try {
      const [count, rows] = await Promise.all([countUnread(session.userId), listNotifications(session.userId, { limit: 8 })]);
      unread = count;
      notifications = rows.map((n) => ({ id: n.id, ...describeNotification(n), read: !!n.readAt, when: timeAgo(n.createdAt) }));
    } catch (e) {
      console.error("[layout] notificações indisponíveis", e);
    }
  }
  const [cats, stores, ads, brand, newsletter] = await Promise.all([
    listCategories().catch(() => []),
    listMenuStores().catch(() => []),
    getAdsSettings(),
    getBrandSettings(),
    newsletterAvailable(),
  ]);
  const categories = cats.map((c) => ({ name: c.name, slug: c.slug }));
  // Lojas do menu "Cupons": só as ativas (as que o robô cria ficam em revisão até alguém aprovar).
  const couponStores = stores.filter((s) => s.status === "active").slice(0, 30).map((s) => ({ name: s.name, slug: s.slug }));
  return (
    <html lang="pt-BR" className={`${figtree.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <AdLayoutStyles />
        <AdsProvider config={ads}>
          <BfBanner />
          <AppHeader siteName={brand.siteName} session={session} unread={unread} notifications={notifications} categories={categories} couponStores={couponStores} />
          <div className="relative flex-1">
            <SideRails />
            <main id="conteudo">{children}</main>
          </div>
          <Footer notice={brand.commissionNotice} newsletter={newsletter} />
          <BottomNav categories={categories} loggedIn={!!session} isStaff={session?.role === "admin" || session?.role === "moderator"} unread={unread} />
          <ConsentBanner />
          <AdScript />
        </AdsProvider>
      </body>
    </html>
  );
}

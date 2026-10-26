// Imagem que aparece quando alguém compartilha o site (WhatsApp, Telegram, redes). Ofertas com foto usam a foto.
import { ImageResponse } from "next/og";
import { DEFAULT_BRAND, getBrandSettings } from "@/lib/data/settings";

export const alt = "PromoValeu: ofertas que valem a pena compartilhar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BAG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M24 25v-6a8 8 0 0 1 16 0v6" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><path d="M19 23h26a3 3 0 0 1 3 2.7l2.7 24a3 3 0 0 1-3 3.3H16.3a3 3 0 0 1-3-3.3l2.7-24a3 3 0 0 1 3-2.7Z" fill="#fff"/><circle cx="26" cy="33" r="3" fill="none" stroke="#6d28d9" stroke-width="3"/><circle cx="38" cy="44" r="3" fill="none" stroke="#6d28d9" stroke-width="3"/><path d="m25 45 14-14" fill="none" stroke="#6d28d9" stroke-width="4" stroke-linecap="round"/></svg>',
  );

export default async function OpenGraphImage() {
  const brand = await getBrandSettings().catch(() => DEFAULT_BRAND);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: "linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BAG} width={120} height={120} alt="" />
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: "-2px" }}>{brand.siteName}</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 52, fontWeight: 700 }}>Ofertas que valem a pena compartilhar</div>
        <div style={{ marginTop: 20, fontSize: 34, opacity: 0.85 }}>Desconto conferido pelo histórico de preço. Cupons testados pela comunidade.</div>
      </div>
    ),
    size,
  );
}

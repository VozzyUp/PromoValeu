// Começa a autorização no Mercado Livre (só administrador). Guarda o "state" e o verificador PKCE num cookie de 10 minutos.
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getIntegrationConfig } from "@/lib/data/integrations";
import { authorizeUrl, mlRedirectUri } from "@/lib/integrations/mercadolivre";
import { redirectToPath } from "@/lib/redirect";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const cfg = await getIntegrationConfig<{ clientId: string; clientSecret: string }>("mercadolivre");
  if (!cfg) return redirectToPath("/painel/integracoes?ml=salve", 302);
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const res = NextResponse.redirect(authorizeUrl({ clientId: cfg.clientId, redirectUri: mlRedirectUri(), state, challenge }), 302);
  res.cookies.set("ml_oauth", JSON.stringify({ state, verifier }), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/api/mercadolivre", maxAge: 600,
  });
  return res;
}

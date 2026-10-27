// Volta da autorização do Mercado Livre: confere o "state", troca o código pela chave e guarda criptografada.
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { getIntegrationConfig, saveMlTokens } from "@/lib/data/integrations";
import { exchangeCode, mlRedirectUri } from "@/lib/integrations/mercadolivre";
import { redirectToPath } from "@/lib/redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const jar = await cookies();
  const saved = jar.get("ml_oauth")?.value;
  jar.delete({ name: "ml_oauth", path: "/api/mercadolivre" });
  const back = (msg: string) => redirectToPath(`/painel/integracoes?ml=${encodeURIComponent(msg)}`, 302);

  const code = url.searchParams.get("code");
  if (!code) return back(url.searchParams.get("error_description") ?? "O Mercado Livre não autorizou.");
  let flow: { state?: string; verifier?: string } = {};
  try {
    flow = JSON.parse(saved ?? "{}");
  } catch {
    flow = {};
  }
  if (!flow.state || flow.state !== url.searchParams.get("state") || !flow.verifier) return back("A autorização expirou. Clique em Conectar de novo.");

  const cfg = await getIntegrationConfig<{ clientId: string; clientSecret: string }>("mercadolivre");
  if (!cfg) return back("Salve o Client ID e a Secret Key e marque Ligada.");
  try {
    const tokens = await exchangeCode({ clientId: cfg.clientId, clientSecret: cfg.clientSecret, code, redirectUri: mlRedirectUri(), verifier: flow.verifier });
    await saveMlTokens(tokens);
  } catch (e) {
    return back(e instanceof Error ? e.message.slice(0, 200) : "Falha ao conectar.");
  }
  return back("ok");
}

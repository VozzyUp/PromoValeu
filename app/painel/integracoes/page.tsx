import { IntegrationForm } from "@/components/admin/integration-form";
import { requireAdmin } from "@/lib/auth";
import { hasMasterKey } from "@/lib/crypto";
import { listIntegrationViews } from "@/lib/data/integrations";
import { INTEGRATIONS } from "@/lib/integrations-def";
import { supabaseEnabled } from "@/lib/supabase/server";

export const metadata = { title: "Painel: integrações" };

export default async function PanelIntegrationsPage({ searchParams }: PageProps<"/painel/integracoes">) {
  await requireAdmin();
  const ml = (await searchParams).ml;
  const mlMsg = Array.isArray(ml) ? ml[0] : ml;
  if (!supabaseEnabled()) return <p className="mx-auto max-w-(--layout-max) px-4 py-8 text-sm text-muted">Precisa do Supabase configurado.</p>;
  const views = await listIntegrationViews();
  return (
    <div className="mx-auto flex max-w-(--layout-max) flex-col gap-4 px-4 py-8">
      <h1 className="text-xl font-bold">Integrações</h1>
      <p className="text-sm text-muted">As chaves ficam criptografadas no banco e nunca voltam para esta tela.</p>
      {mlMsg ? (
        <p role="status" className={`rounded-card p-3 text-sm font-bold ${mlMsg === "ok" ? "bg-price-soft text-price" : "bg-danger text-on-accent"}`}>
          {mlMsg === "ok" ? "Mercado Livre conectado. O robô já usa a API para conferir os preços." : mlMsg === "salve" ? "Salve o Client ID e a Secret Key e marque Ligada antes de conectar." : `Mercado Livre: ${mlMsg}`}
        </p>
      ) : null}
      {!hasMasterKey() ? (
        <p role="alert" className="rounded-card bg-danger p-3 text-sm font-bold text-on-accent">
          A MASTER_KEY não está configurada no servidor. Sem ela não dá para salvar credenciais. Gere uma com openssl rand -hex 32.
        </p>
      ) : null}
      {INTEGRATIONS.map((def) => <IntegrationForm key={def.key} def={def} view={views.find((v) => v.key === def.key)!} />)}
    </div>
  );
}
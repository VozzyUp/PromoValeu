// Credenciais das integrações: partes secretas criptografadas, partes públicas em claro. Só Supabase.
import "server-only";
import { decryptJson, encryptJson, hasMasterKey } from "../crypto";
import { INTEGRATIONS, integrationDef, type IntegrationKey } from "../integrations-def";
import { getMe } from "../integrations/telegram";
import { searchOffers } from "../integrations/shopee";
import { complete } from "../integrations/anthropic";
import { verifySmtp } from "../integrations/smtp";
import { instanceStatus } from "../integrations/uazapi";
import { mlMe, refreshTokens, type MlTokens } from "../integrations/mercadolivre";
import { db } from "../supabase/db";

type Row = {
  key: string; enabled: boolean; config_encrypted: string | null; public_config: Record<string, string>;
  status: "untested" | "ok" | "error"; last_error: string | null; last_tested_at: string | null;
};

export type IntegrationView = {
  key: IntegrationKey; enabled: boolean; status: Row["status"]; lastError: string | null; lastTestedAt: string | null;
  values: Record<string, string>; // só campos públicos
  secretsSet: Record<string, boolean>;
};

function secretsOf(row: Row | null): Record<string, string> {
  if (!row?.config_encrypted) return {};
  try {
    return decryptJson<Record<string, string>>(row.config_encrypted);
  } catch (e) {
    console.error("[integrations] não foi possível decifrar", row.key, e);
    return {};
  }
}

async function readRow(key: string): Promise<Row | null> {
  const { data, error } = await db().from("integrations").select("*").eq("key", key).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

export async function listIntegrationViews(): Promise<IntegrationView[]> {
  const { data, error } = await db().from("integrations").select("*");
  if (error) throw error;
  const rows = new Map((data as Row[]).map((r) => [r.key, r]));
  return INTEGRATIONS.map((def) => {
    const row = rows.get(def.key) ?? null;
    const secrets = secretsOf(row);
    return {
      key: def.key, enabled: row?.enabled ?? false, status: row?.status ?? "untested", lastError: row?.last_error ?? null,
      lastTestedAt: row?.last_tested_at ?? null, values: row?.public_config ?? {},
      secretsSet: Object.fromEntries(def.fields.filter((f) => f.secret).map((f) => [f.name, !!secrets[f.name]])),
    };
  });
}

let aiCache: { value: boolean; expires: number } | null = null;

/** O botão de IA só aparece com a integração ligada e completa. Cache de 60 s. */
export async function aiAvailable(): Promise<boolean> {
  if (aiCache && aiCache.expires > Date.now()) return aiCache.value;
  let value = false;
  try {
    value = hasMasterKey() && !!(await getIntegrationConfig("anthropic"));
  } catch {
    value = false;
  }
  aiCache = { value, expires: Date.now() + 60_000 };
  return value;
}

/** Configuração completa (pública + secreta) de uma integração ligada; null se desligada ou incompleta. */
export async function getIntegrationConfig<T extends Record<string, string>>(key: IntegrationKey): Promise<T | null> {
  const def = integrationDef(key);
  const row = await readRow(key);
  if (!def || !row?.enabled) return null;
  const merged = { ...row.public_config, ...secretsOf(row) };
  return def.fields.every((f) => !!merged[f.name]) ? (merged as T) : null;
}

export async function saveIntegration(key: IntegrationKey, enabled: boolean, input: Record<string, string>): Promise<void> {
  const def = integrationDef(key);
  if (!def) throw new Error("Integração desconhecida.");
  if (!hasMasterKey()) throw new Error("MASTER_KEY não configurada no servidor: não dá para guardar credenciais com segurança.");
  const row = await readRow(key);
  const secrets = secretsOf(row);
  const pub: Record<string, string> = {};
  for (const f of def.fields) {
    const v = (input[f.name] ?? "").trim();
    if (f.secret) {
      if (v) secrets[f.name] = v; // vazio = mantém o que já estava salvo
    } else {
      pub[f.name] = v;
    }
  }
  const { error } = await db().from("integrations").upsert({
    key, enabled, public_config: pub,
    config_encrypted: Object.keys(secrets).length ? encryptJson(secrets) : null,
    status: "untested", last_error: null, updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (error) throw error;
}

/** Faz uma chamada leve ao serviço e registra o resultado. */
export async function testIntegration(key: IntegrationKey): Promise<{ ok: boolean; message: string }> {
  const row = await readRow(key);
  const def = integrationDef(key);
  if (!row || !def) return { ok: false, message: "Salve as credenciais antes de testar." };
  const cfg = { ...row.public_config, ...secretsOf(row) };
  let result: { ok: boolean; message: string };
  try {
    if (def.fields.some((f) => !cfg[f.name])) throw new Error("Faltam campos para testar.");
    if (key === "telegram") result = { ok: true, message: `Conectado ao bot @${(await getMe(cfg.botToken)).username}.` };
    else if (key === "smtp") {
      await verifySmtp({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, from: cfg.from });
      result = { ok: true, message: `Conectado a ${cfg.host}:${cfg.port} e autenticado.` };
    } else if (key === "anthropic") {
      await complete({ apiKey: cfg.apiKey, model: cfg.model }, { system: "Responda só com a palavra ok.", user: "ok?", maxTokens: 8 });
      result = { ok: true, message: `Conectado. O modelo ${cfg.model} respondeu.` };
    } else if (key === "mercadolivre") {
      const token = await mlAccessToken();
      if (!token) throw new Error("Salve, marque Ligada e clique em Conectar com o Mercado Livre.");
      const me = await mlMe(token);
      result = { ok: true, message: `Conectado como ${me.nickname ?? me.id}.` };
    } else if (key === "shopee") {
      const offers = await searchOffers({ appId: cfg.appId, secret: cfg.secret }, { keyword: "fone", limit: 1 });
      result = { ok: true, message: `Conectado. A busca de teste devolveu ${offers.length} produto(s).` };
    } else {
      const s = await instanceStatus({ baseUrl: cfg.baseUrl, token: cfg.token });
      result = { ok: true, message: `Conectado. Situação da instância: ${s.instance?.status ?? s.status ?? "desconhecida"}.` };
    }
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? e.message.slice(0, 300) : "Falha desconhecida." };
  }
  await db().from("integrations").update({
    status: result.ok ? "ok" : "error", last_error: result.ok ? null : result.message, last_tested_at: new Date().toISOString(),
  }).eq("key", key);
  return result;
}
/* ------------------------------------------------- Mercado Livre: chave de acesso */

/** Grava a chave recebida do Mercado Livre junto das credenciais (criptografada). */
export async function saveMlTokens(t: MlTokens): Promise<void> {
  const row = await readRow("mercadolivre");
  if (!row) throw new Error("Salve o Client ID e a Secret Key antes.");
  const secrets = {
    ...secretsOf(row),
    accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: String(Date.now() + (t.expires_in - 120) * 1000),
  };
  const { error } = await db().from("integrations").update({
    config_encrypted: encryptJson(secrets), status: "ok", last_error: null, last_tested_at: new Date().toISOString(),
  }).eq("key", "mercadolivre");
  if (error) throw error;
}

let refreshing: Promise<string | null> | null = null;

/** Chave válida do Mercado Livre (renova se venceu). null se não estiver conectado. */
export async function mlAccessToken(): Promise<string | null> {
  const row = await readRow("mercadolivre");
  if (!row?.enabled) return null;
  const s = secretsOf(row);
  const clientId = row.public_config.clientId;
  if (!clientId || !s.clientSecret || !s.refreshToken) return null;
  if (s.accessToken && Number(s.expiresAt) > Date.now()) return s.accessToken;
  // A renovação usa a chave de renovação uma vez só: duas renovações ao mesmo tempo quebrariam a conexão.
  refreshing ??= refreshTokens({ clientId, clientSecret: s.clientSecret, refreshToken: s.refreshToken })
    .then(async (t) => {
      await saveMlTokens(t);
      return t.access_token;
    })
    .catch(async (e) => {
      await db().from("integrations").update({ status: "error", last_error: e instanceof Error ? e.message.slice(0, 300) : "Falha ao renovar." }).eq("key", "mercadolivre");
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

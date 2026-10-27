// Categoria automática: a IA (Claude, se a integração estiver ligada) escolhe pelo nome do produto;
// sem IA ou se ela falhar, valem as regras por palavra de lib/categorize.ts.
import "server-only";
import { aiCategoryPrompt, categorize, parseAiCategories, type CategorySlug } from "../categorize";
import { complete, type AnthropicConfig } from "../integrations/anthropic";
import { db } from "../supabase/db";
import { listCategories } from "./index";
import { getIntegrationConfig } from "./integrations";

const BATCH = 50;

async function aiConfig(): Promise<AnthropicConfig | null> {
  try {
    const cfg = await getIntegrationConfig<AnthropicConfig>("anthropic");
    return cfg?.apiKey ? { apiKey: cfg.apiKey, model: cfg.model || "claude-haiku-5-5" } : null;
  } catch {
    return null;
  }
}

/** Categoria de cada título, na mesma ordem. */
export async function categorizeTitles(titles: string[]): Promise<CategorySlug[]> {
  const cfg = await aiConfig();
  const out: CategorySlug[] = [];
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    let ai: (CategorySlug | null)[] = chunk.map(() => null);
    if (cfg) {
      try {
        const p = aiCategoryPrompt(chunk);
        ai = parseAiCategories(await complete(cfg, { ...p, maxTokens: 20 * chunk.length + 50 }), chunk.length);
      } catch (e) {
        console.error("[categoria] IA falhou, usando as regras:", e instanceof Error ? e.message : e);
      }
    }
    chunk.forEach((t, j) => out.push(ai[j] ?? categorize(t)));
  }
  return out;
}

/** Id da categoria escolhida pelo título (null se a categoria não existir no banco). */
export async function autoCategoryId(title: string): Promise<string | null> {
  const [slug] = await categorizeTitles([title]);
  const cats = await listCategories();
  return cats.find((c) => c.slug === slug)?.id ?? null;
}

/** Classifica as ofertas que estão sem categoria. Não mexe em quem já tem categoria. */
export async function classifyUncategorized(): Promise<{ checked: number; updated: number; usedAi: boolean }> {
  const cats = await listCategories();
  const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  const { data, error } = await db().from("deals").select("id, title").is("category_id", null).neq("status", "rejected").limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; title: string }[];
  const slugs = await categorizeTitles(rows.map((r) => r.title));

  const groups = new Map<string, string[]>();
  rows.forEach((r, i) => {
    const id = idBySlug.get(slugs[i]);
    if (id) groups.set(id, [...(groups.get(id) ?? []), r.id]);
  });
  let updated = 0;
  for (const [categoryId, ids] of groups) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const res = await db().from("deals").update({ category_id: categoryId }).in("id", chunk).is("category_id", null);
      if (res.error) throw res.error;
      updated += chunk.length;
    }
  }
  return { checked: rows.length, updated, usedAi: !!(await aiConfig()) };
}

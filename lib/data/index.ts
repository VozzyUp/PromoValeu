// Ponto único de acesso a dados. Com NEXT_PUBLIC_SUPABASE_URL configurado usa o Supabase;
// sem ele, a camada em memória (desenvolvimento sem banco). As duas têm as mesmas assinaturas.
import "server-only";
import { cache } from "react";
import * as memory from "./memory";
import * as supabase from "./supabase";
import { supabaseEnabled } from "../supabase/server";

// Só o que a camada em memória também oferece; o restante do supabase.ts é importado direto pelos módulos novos.
type DataApi = Pick<
  typeof supabase,
  | "listFeed" | "listHot" | "getDealBySlug" | "getDealByCode" | "listCategories" | "listStores" | "getProfile"
  | "isUsernameTaken" | "listPendingDeals" | "recordClick" | "createStoreForHost" | "createDeal"
  | "countDealsByAuthorSince" | "moderateDeal" | "vote"
>;

const impl: DataApi = supabaseEnabled() ? supabase : memory;

export const {
  listFeed,
  listHot,
  getDealByCode,
  listStores,
  getProfile,
  isUsernameTaken,
  listPendingDeals,
  recordClick,
  createStoreForHost,
  createDeal,
  countDealsByAuthorSince,
  moderateDeal,
  vote,
} = impl;
export type { NewDeal } from "./supabase";

/** Guarda o resultado por alguns segundos na memória do servidor (se a consulta falhar, não guarda). */
function keepFor<T>(ms: number, load: () => Promise<T>): () => Promise<T> {
  let hit: { value: Promise<T>; expires: number } | null = null;
  return () => {
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = load();
    hit = { value, expires: Date.now() + ms };
    value.catch(() => {
      hit = null;
    });
    return value;
  };
}

/** Os metadados e a página da oferta pedem a mesma oferta: uma consulta só por requisição. */
export const getDealBySlug = cache(impl.getDealBySlug);
/** Categorias não são editadas pelo site: 5 minutos de cache poupam uma consulta em toda página. */
export const listCategories = keepFor(5 * 60_000, impl.listCategories);
/**
 * Lojas para o menu "Cupons" (1 minuto de cache). Para reconhecer a loja de um link use listStores,
 * que lê sempre do banco: uma loja recém-criada precisa aparecer na hora para não ser criada duas vezes.
 */
export const listMenuStores = keepFor(60_000, impl.listStores);

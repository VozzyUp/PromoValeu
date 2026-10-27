// Código do produto num link do Mercado Livre. Função pura, testada em tests/ml-url.test.ts.

export type MlRef = { kind: "item" | "product" | "user_product"; id: string };

/**
 * - anúncio: produto.mercadolivre.com.br/MLB-1352321521-nome-_JM  -> item MLB1352321521
 * - catálogo: www.mercadolivre.com.br/nome/p/MLB19615343           -> product MLB19615343
 *   (com ?pdp_filters=item_id:MLB123 ou ?item_id=MLB123, vale o anúncio escolhido)
 * - produto do vendedor: www.mercadolivre.com.br/nome/up/MLBU761780951 -> user_product MLBU761780951
 */
export function parseMlUrl(raw: string): MlRef | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)mercadoli[bv]re\.com(\.br)?$/i.test(u.hostname)) return null;
  const chosen = /item_id[:=](MLB-?\d{6,})/i.exec(decodeURIComponent(u.search));
  if (chosen) return { kind: "item", id: chosen[1].replace("-", "").toUpperCase() };
  const up = /\/up\/(MLBU\d{6,})/i.exec(u.pathname);
  if (up) return { kind: "user_product", id: up[1].toUpperCase() };
  const product = /\/p\/(MLB\d{6,})/i.exec(u.pathname);
  if (product) return { kind: "product", id: product[1].toUpperCase() };
  const item = /\/(MLB)-?(\d{6,})/i.exec(u.pathname);
  if (item) return { kind: "item", id: `MLB${item[2]}` };
  return null;
}

// Filtros da busca do site: "contém a palavra" no título. Cada palavra vira um
// filtro `or` do PostgREST (todas as palavras são combinadas com E):
//  - palavra com 3+ letras: título contém a palavra (ILIKE) OU prefixo na busca
//    de texto (que ignora acentos: "cafe" acha "Café");
//  - palavra com 1-2 letras: só o prefixo na busca de texto (evita ruído como
//    "ar" dentro de "carregador").
// O "s" final de plural é removido (palavras com 4+ letras): "pneus" acha "Pneu".
// Só letras e números passam, o que também remove operadores e caracteres
// reservados do PostgREST/tsquery.
export function searchFilters(input: string): string[] | null {
  const words = (input.slice(0, 80).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  if (words.length === 0) return null;
  return words.map((w) => {
    const stem = w.length >= 4 && w.endsWith("s") ? w.slice(0, -1) : w;
    const fts = `search.fts(pt_unaccent).${stem}:*`;
    return w.length >= 3 ? `title.ilike.*${stem}*,${fts}` : fts;
  });
}

// Monta uma tsquery para a busca do site. O stemmer português não junta
// singular e plural ("pneus" fica "pneus", "pneu" fica "pneu"), então tiramos
// o "s" final e usamos prefixo (`:*`): "pneu" acha "pneus" e vice-versa.
// Só letras e números passam, o que também remove operadores de tsquery.
export function searchTsQuery(input: string): string | null {
  const words = (input.slice(0, 80).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  if (words.length === 0) return null;
  return words
    .map((w) => `${w.length >= 4 && w.endsWith("s") ? w.slice(0, -1) : w}:*`)
    .join(" & ");
}

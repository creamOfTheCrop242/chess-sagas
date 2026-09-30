/** Match literal source text; only strip one pair of presentation quotes.
 * Never normalize words, punctuation within the quote, or character names. */
export function groundedExcerpt(
  prose: string,
  excerpt: string | null,
): string | null {
  if (!excerpt?.trim()) return null;
  const exact = excerpt.trim();
  if (prose.includes(exact)) return exact;
  const quotes: Record<string, string> = {
    '"': '"',
    "'": "'",
    '“': '”',
    '‘': '’',
  };
  if (quotes[exact[0]] === exact.at(-1)) {
    const inner = exact.slice(1, -1).trim();
    if (inner && prose.includes(inner)) return inner;
  }
  return null;
}

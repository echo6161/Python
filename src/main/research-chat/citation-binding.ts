const CITATION_TOKEN = /\[([A-Z][A-Z0-9]{1,11})\]/gu;

export function extractCitationAliases(content: string): readonly string[] {
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(CITATION_TOKEN)) {
    const alias = match[1];
    if (alias && !seen.has(alias)) {
      aliases.push(alias);
      seen.add(alias);
    }
  }
  return aliases;
}

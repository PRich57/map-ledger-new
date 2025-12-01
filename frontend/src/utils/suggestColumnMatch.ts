export function suggestColumnMatch(
  input: string,
  destinationHeaders: string[]
): { match: string | null; confidence: number } {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9]/g, '');

  const knownAliases: Record<string, string> = {
    description: 'Account Description',
    acctdesc: 'Account Description',
    glacct: 'GL ID',
    glaccountcode: 'GL ID',
    netchg: 'Net Change',
    netchangeamount: 'Net Change',
    company: 'Entity',
  };

  const aliasMatch = Object.keys(knownAliases).find((alias) =>
    cleaned.includes(alias)
  );
  if (aliasMatch) {
    return { match: knownAliases[aliasMatch], confidence: 0.9 };
  }

  const scores = destinationHeaders.map((dest) => {
    const cleanDest = dest.toLowerCase().replace(/[^a-z0-9]/g, '');
    let score = 0;
    if (cleanDest.includes(cleaned) || cleaned.includes(cleanDest)) score = 0.6;
    if (cleaned === cleanDest) score = 1.0;
    return { dest, score };
  });

  const top = scores.sort((a, b) => b.score - a.score)[0];
  if (top && top.score >= 0.6) {
    return { match: top.dest, confidence: top.score };
  }

  return { match: null, confidence: 0 };
}

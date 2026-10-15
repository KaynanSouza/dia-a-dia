/** Camada 4: pré-filtro por trigramas (Dice) + verificação Jaro-Winkler. */

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;
  const window = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Uint8Array(la);
  const mb = new Uint8Array(lb);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(lb - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (!mb[j] && a[i] === b[j]) {
        ma[i] = mb[j] = 1;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < la; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / la + matches / lb + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < la && prefix < lb && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

const trigrams = (s: string): string[] => {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return [...out];
};

export type FuzzyCandidate = { key: string; categoryId: string; source: 'dictionary' | 'learned' };
export type FuzzyHit = FuzzyCandidate & { score: number };

export class FuzzyIndex {
  private index = new Map<string, number[]>();
  private grams: number[] = [];

  constructor(private candidates: FuzzyCandidate[]) {
    candidates.forEach((c, i) => {
      const g = trigrams(c.key);
      this.grams[i] = g.length;
      for (const t of g) {
        const list = this.index.get(t) ?? [];
        list.push(i);
        this.index.set(t, list);
      }
    });
  }

  /** Melhor candidato com JW ≥ threshold entre os 8 de maior Dice. Chaves curtas (< 4) não entram. */
  best(query: string, threshold = 0.9): FuzzyHit | null {
    if (query.length < 4 || !this.candidates.length) return null;
    const q = trigrams(query);
    const shared = new Map<number, number>();
    for (const t of q) for (const i of this.index.get(t) ?? []) shared.set(i, (shared.get(i) ?? 0) + 1);

    const shortlist = [...shared.entries()]
      .map(([i, n]) => ({ i, dice: (2 * n) / (q.length + this.grams[i]) }))
      .filter((x) => x.dice >= 0.4)
      .sort((a, b) => b.dice - a.dice)
      .slice(0, 8);

    let best: FuzzyHit | null = null;
    for (const { i } of shortlist) {
      const c = this.candidates[i];
      if (c.key.length < 4) continue;
      const score = jaroWinkler(query, c.key);
      if (score >= threshold && (!best || score > best.score)) best = { ...c, score };
    }
    return best;
  }
}

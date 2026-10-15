import { significantTokens } from './normalize';

export type DictionaryEntry = { key: string; displayName: string; categoryId: string };
export type DictionaryHit = DictionaryEntry & { position: number };

/**
 * Camada 3: índice primeiro-token → entradas (mais longas primeiro).
 * Casa a chave como sequência contígua de tokens; vence a ocorrência mais à esquerda e, nela, a mais longa.
 */
export class MerchantDictionary {
  private byFirst = new Map<string, { tokens: string[]; entry: DictionaryEntry }[]>();
  readonly size: number;

  constructor(entries: DictionaryEntry[]) {
    for (const entry of entries) {
      const tokens = significantTokens(entry.key);
      if (!tokens.length) continue;
      const list = this.byFirst.get(tokens[0]) ?? [];
      list.push({ tokens, entry });
      this.byFirst.set(tokens[0], list);
    }
    for (const list of this.byFirst.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
    this.size = entries.length;
  }

  match(tokens: string[]): DictionaryHit | null {
    for (let i = 0; i < tokens.length; i++) {
      const candidates = this.byFirst.get(tokens[i]);
      if (!candidates) continue;
      for (const c of candidates) {
        if (c.tokens.every((t, j) => tokens[i + j] === t)) return { ...c.entry, position: i };
      }
    }
    return null;
  }

  keys(): DictionaryEntry[] {
    return [...this.byFirst.values()].flatMap((l) => l.map((x) => x.entry));
  }
}

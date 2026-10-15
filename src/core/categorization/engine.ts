export type Rule = {
  id: string;
  category_id: string;
  match_type: 'contains' | 'starts_with' | 'equals' | 'regex';
  pattern: string;
  priority: number;
};

export type CompiledRule = Rule & { test: (descNorm: string) => boolean };

/** Compila uma vez por importação. Regex inválida ou perigosa vira regra que nunca casa. */
export function compileRules(rules: Rule[]): CompiledRule[] {
  return [...rules]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map((r) => {
      const p = r.pattern.toLowerCase();
      let test: (d: string) => boolean;
      switch (r.match_type) {
        case 'contains':
          test = (d) => d.includes(p);
          break;
        case 'starts_with':
          test = (d) => d.startsWith(p);
          break;
        case 'equals':
          test = (d) => d === p;
          break;
        case 'regex': {
          let re: RegExp | null = null;
          // rejeita quantificadores aninhados (ReDoS)
          if (!/\([^)]*[+*][^)]*\)[+*{]/.test(r.pattern)) {
            try {
              re = new RegExp(r.pattern, 'i');
            } catch {}
          }
          test = (d) => (re ? re.test(d) : false);
          break;
        }
      }
      return { ...r, test };
    });
}

/** Primeira regra (menor prioridade) que casar define a categoria. */
export function categorize(descNorm: string, rules: CompiledRule[]): string | null {
  for (const r of rules) if (r.test(descNorm)) return r.category_id;
  return null;
}

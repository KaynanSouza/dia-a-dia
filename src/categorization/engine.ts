import { CAT } from './builtin/categories';
import type { MerchantDictionary } from './dictionary';
import type { FuzzyIndex } from './fuzzy';
import { extractFeatures } from './ml/features';
import { predict, type SerializedModel } from './ml/naive-bayes';
import { normalizeForCategorization, type NormalizedDescription } from './normalize';

export type CategorySource = 'user_rule' | 'dictionary' | 'fuzzy' | 'ml' | 'none';

export type Rule = {
  id: string;
  category_id: string;
  match_type: 'merchant' | 'contains' | 'starts_with' | 'equals' | 'regex';
  pattern: string;
  account_id: string | null;
  priority: number;
};

export type CategorizeInput = { description: string; amountCents: number; accountId: string; accountKind: 'checking' | 'credit_card' | string };

export type CategorizeResult = {
  normalized: NormalizedDescription;
  categoryId: string | null;
  source: CategorySource;
  confidence: number | null;
  ruleId?: string;
};

type CompiledRule = Rule & { test: (n: NormalizedDescription) => boolean };

export function compileRules(rules: Rule[]): CompiledRule[] {
  return [...rules]
    .sort((a, b) => a.priority - b.priority)
    .map((r) => {
      const p = r.pattern.toLowerCase();
      let test: (n: NormalizedDescription) => boolean;
      switch (r.match_type) {
        case 'merchant':
          test = (n) => n.merchantKey === p;
          break;
        case 'contains':
          test = (n) => n.clean.includes(p);
          break;
        case 'starts_with':
          test = (n) => n.clean.startsWith(p);
          break;
        case 'equals':
          test = (n) => n.clean === p;
          break;
        case 'regex': {
          let re: RegExp | null = null;
          if (!/\([^)]*[+*][^)]*\)[+*{]/.test(r.pattern)) {
            try {
              re = new RegExp(r.pattern, 'i');
            } catch {}
          }
          test = (n) => !!re && re.test(n.clean);
          break;
        }
      }
      return { ...r, test };
    });
}

export type EngineDeps = {
  rules: Rule[];
  dictionary: MerchantDictionary;
  fuzzy: FuzzyIndex;
  model: SerializedModel | null;
  minMlConfidence: number;
};

/**
 * Pipeline em camadas (a primeira que decidir vence):
 *  1. regras do usuário   2. normalização (+ heurística de fatura)   3. dicionário
 *  4. match difuso        5. classificador local (TF-IDF + NB)
 * Cache por (conta, texto limpo, sinal): extratos repetem muito o mesmo estabelecimento.
 */
export class CategorizationEngine {
  private rules: CompiledRule[];
  private cache = new Map<string, Omit<CategorizeResult, 'normalized'>>();
  readonly stats = { user_rule: 0, dictionary: 0, fuzzy: 0, ml: 0, none: 0, ruleHits: new Map<string, number>() };

  constructor(private deps: EngineDeps) {
    this.rules = compileRules(deps.rules);
  }

  categorize(input: CategorizeInput): CategorizeResult {
    // Camada 2 primeiro porque todas as outras consomem o texto normalizado
    const normalized = normalizeForCategorization(input.description);
    const sign = input.amountCents < 0 ? '-' : '+';
    const cacheKey = `${input.accountId}|${sign}|${normalized.clean}`;
    let r = this.cache.get(cacheKey);
    if (!r) {
      r = this.decide(normalized, input);
      this.cache.set(cacheKey, r);
    }
    this.stats[r.source]++;
    if (r.ruleId) this.stats.ruleHits.set(r.ruleId, (this.stats.ruleHits.get(r.ruleId) ?? 0) + 1);
    return { normalized, ...r };
  }

  private decide(n: NormalizedDescription, input: CategorizeInput): Omit<CategorizeResult, 'normalized'> {
    // 1. Regras do usuário
    for (const rule of this.rules) {
      if (rule.account_id && rule.account_id !== input.accountId) continue;
      if (rule.test(n)) return { categoryId: rule.category_id, source: 'user_rule', confidence: 1, ruleId: rule.id };
    }

    // 2. Heurística estrutural: pagamento de fatura nunca é gasto (evita contagem dupla)
    if (n.flags.cardPayment || (input.accountKind === 'credit_card' && input.amountCents > 0 && /\bpagamento\b/.test(n.clean))) {
      return { categoryId: CAT.CARD_PAYMENT, source: 'dictionary', confidence: 0.99 };
    }

    // 3. Dicionário
    const hit = this.deps.dictionary.match(n.tokens);
    if (hit) return { categoryId: hit.categoryId, source: 'dictionary', confidence: hit.position === 0 ? 0.95 : 0.85 };

    // PIX/TED para pessoas: nomes próprios geram falsos positivos no difuso/ML ("maria" ≈ "marisa").
    // Ficam sem categoria (ou viram transferência no pareamento entre contas próprias).
    if (n.flags.pix || n.flags.transfer) return { categoryId: null, source: 'none', confidence: null };

    // 4. Difuso (erros de digitação, abreviações: "drogasill", "smartft")
    const first = n.tokens[0] ?? '';
    const fz = this.deps.fuzzy.best(n.merchantKey) ?? (first.length >= 6 ? this.deps.fuzzy.best(first, 0.93) : null);
    if (fz) return { categoryId: fz.categoryId, source: 'fuzzy', confidence: Math.round(fz.score * 100) / 100 };

    // 5. Classificador local
    if (this.deps.model) {
      const p = predict(this.deps.model, extractFeatures(n.tokens));
      if (p && p.confidence >= this.deps.minMlConfidence) {
        return { categoryId: p.label, source: 'ml', confidence: Math.round(p.confidence * 100) / 100 };
      }
    }
    return { categoryId: null, source: 'none', confidence: null };
  }
}

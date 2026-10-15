import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting } from '@/db/repositories/settings.repo';
import { MerchantDictionary } from './dictionary';
import { CategorizationEngine, type Rule } from './engine';
import { FuzzyIndex, type FuzzyCandidate } from './fuzzy';
import { loadOrTrainModel } from './ml/model-store';
import { seedBuiltins } from './seed';

/** Monta o motor a partir do banco (regras, dicionário, estabelecimentos aprendidos, modelo). */
export async function createEngine(db: SQLiteDatabase): Promise<CategorizationEngine> {
  await seedBuiltins(db);

  const [rules, dict, learned, model, minMlConfidence] = await Promise.all([
    db.getAllAsync<Rule>('SELECT id, category_id, match_type, pattern, account_id, priority FROM categorization_rules;'),
    db.getAllAsync<{ key: string; display_name: string; category_id: string }>('SELECT key, display_name, category_id FROM merchant_dictionary;'),
    // Estabelecimentos que o usuário corrigiu: categoria mais frequente por merchant_key
    db.getAllAsync<{ merchant_key: string; category_id: string }>(
      `SELECT merchant_key, category_id FROM (
         SELECT merchant_key, category_id, count(*) AS n,
                row_number() OVER (PARTITION BY merchant_key ORDER BY count(*) DESC) AS rk
         FROM transactions
         WHERE category_source = 'manual' AND category_id IS NOT NULL AND length(merchant_key) >= 4
         GROUP BY merchant_key, category_id
       ) WHERE rk = 1;`,
    ),
    loadOrTrainModel(db),
    getSetting<number>(db, 'ml.min_confidence', 0.6),
  ]);

  const dictionary = new MerchantDictionary(dict.map((d) => ({ key: d.key, displayName: d.display_name, categoryId: d.category_id })));
  const candidates: FuzzyCandidate[] = [
    ...learned.map((l) => ({ key: l.merchant_key, categoryId: l.category_id, source: 'learned' as const })),
    ...dict.filter((d) => d.key.length >= 4).map((d) => ({ key: d.key, categoryId: d.category_id, source: 'dictionary' as const })),
  ];

  return new CategorizationEngine({ rules, dictionary, fuzzy: new FuzzyIndex(candidates), model, minMlConfidence });
}

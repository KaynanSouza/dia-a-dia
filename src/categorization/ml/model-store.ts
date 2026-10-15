import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { bus } from '@/events/bus';
import { normalizeForCategorization } from '../normalize';
import { extractFeatures } from './features';
import { MODEL_VERSION, train, type SerializedModel, type TrainingDoc } from './naive-bayes';

const MODEL_ID = 'tfidf-nb';
const MAX_USER_SAMPLES = 20_000;

/**
 * Treino 100% local: dicionário (embutido + do usuário) e correções manuais / regras do usuário.
 * O hash do conjunto de treino evita retreinar quando nada mudou.
 */
async function trainingSignature(db: SQLiteDatabase): Promise<string> {
  const row = await db.getFirstAsync<{ d: string; m: string; r: string }>(
    `SELECT
       (SELECT count(*) || ':' || coalesce(max(updated_at), 0) FROM merchant_dictionary) AS d,
       (SELECT count(*) || ':' || coalesce(max(updated_at), 0) FROM transactions WHERE category_source = 'manual') AS m,
       (SELECT count(*) || ':' || coalesce(max(created_at), 0) FROM categorization_rules) AS r;`,
  );
  return bytesToHex(sha256(utf8ToBytes(`v${MODEL_VERSION}|${row?.d}|${row?.m}|${row?.r}`)));
}

async function buildTrainingSet(db: SQLiteDatabase): Promise<TrainingDoc[]> {
  const docs: TrainingDoc[] = [];

  const dict = await db.getAllAsync<{ key: string; display_name: string; category_id: string; source: string }>(
    'SELECT key, display_name, category_id, source FROM merchant_dictionary;',
  );
  for (const d of dict) {
    const tokens = normalizeForCategorization(`${d.key} ${d.display_name}`).tokens;
    docs.push({ features: extractFeatures(tokens), label: d.category_id, weight: d.source === 'user' ? 3 : 1 });
  }

  const manual = await db.getAllAsync<{ description_raw: string; amount_cents: number; category_id: string }>(
    `SELECT description_raw, amount_cents, category_id FROM transactions
     WHERE category_source = 'manual' AND category_id IS NOT NULL ORDER BY updated_at DESC LIMIT ?;`,
    MAX_USER_SAMPLES,
  );
  for (const t of manual) {
    const n = normalizeForCategorization(t.description_raw);
    docs.push({ features: extractFeatures(n.tokens), label: t.category_id, weight: 5 });
  }

  const rules = await db.getAllAsync<{ pattern: string; category_id: string }>(
    "SELECT pattern, category_id FROM categorization_rules WHERE match_type IN ('merchant', 'contains', 'equals', 'starts_with');",
  );
  for (const r of rules) docs.push({ features: extractFeatures(r.pattern.split(' ')), label: r.category_id, weight: 5 });

  return docs.filter((d) => d.features.length);
}

export async function loadOrTrainModel(db: SQLiteDatabase): Promise<SerializedModel | null> {
  const signature = await trainingSignature(db);
  const cached = await db.getFirstAsync<{ training_hash: string; model_version: number; payload: string }>(
    'SELECT training_hash, model_version, payload FROM ml_model_cache WHERE id = ?;', MODEL_ID,
  );
  if (cached && cached.training_hash === signature && cached.model_version === MODEL_VERSION) {
    return JSON.parse(cached.payload) as SerializedModel;
  }

  const t0 = Date.now();
  const docs = await buildTrainingSet(db);
  if (docs.length < 10) return null;
  const model = train(docs);
  await db.runAsync(
    `INSERT INTO ml_model_cache (id, model_version, training_hash, n_samples, n_features, n_classes, payload, trained_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET model_version = excluded.model_version, training_hash = excluded.training_hash,
       n_samples = excluded.n_samples, n_features = excluded.n_features, n_classes = excluded.n_classes,
       payload = excluded.payload, trained_at = excluded.trained_at;`,
    MODEL_ID, MODEL_VERSION, signature, docs.length, Object.keys(model.idf).length, model.classes.length, JSON.stringify(model), Date.now(),
  );
  bus.emit('ml.trained', { samples: docs.length, features: Object.keys(model.idf).length, ms: Date.now() - t0 });
  return model;
}

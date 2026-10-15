import type { SQLiteDatabase } from 'expo-sqlite';

import { withTransaction } from '@/db/transaction';

import { getSetting, setSetting } from '@/db/repositories/settings.repo';
import { BUILTIN_CATEGORIES, CATEGORIES_VERSION } from './builtin/categories';
import { BUILTIN_MERCHANTS, DICTIONARY_VERSION } from './builtin/merchants';

/**
 * Sincroniza dados embutidos no bundle com o banco, versionado em app_settings.
 * Nunca sobrescreve o que o usuário editou: categorias só entram se faltarem (e só se movem
 * para o pai padrão se ainda estiverem na raiz); entradas 'user' do dicionário têm precedência.
 */
export async function seedBuiltins(db: SQLiteDatabase) {
  const now = Date.now();

  if ((await getSetting<number>(db, 'categories.version', 0)) < CATEGORIES_VERSION) {
    await withTransaction(db, async () => {
      for (const [i, c] of BUILTIN_CATEGORIES.entries()) {
        // conflito de nome com categoria do usuário não pode abortar o seed inteiro
        await db.runAsync(
          `INSERT INTO categories (id, name, parent_id, kind, color, is_system, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             parent_id = coalesce(categories.parent_id, excluded.parent_id),
             color     = coalesce(categories.color, excluded.color),
             sort_order = excluded.sort_order
           WHERE categories.is_system = 1;`,
          c.id, c.name, c.parent ?? null, c.kind, c.color ?? null, i, now,
        ).catch(() => {});
      }
      await setSetting(db, 'categories.version', CATEGORIES_VERSION);
    });
  }

  if ((await getSetting<number>(db, 'dictionary.version', 0)) < DICTIONARY_VERSION) {
    await withTransaction(db, async () => {
      await db.runAsync("DELETE FROM merchant_dictionary WHERE source = 'builtin';");
      for (const [key, display, categoryId] of BUILTIN_MERCHANTS) {
        await db.runAsync(
          `INSERT INTO merchant_dictionary (key, display_name, category_id, source, version, updated_at)
           VALUES (?, ?, ?, 'builtin', ?, ?) ON CONFLICT (key) DO NOTHING;`,
          key, display, categoryId, DICTIONARY_VERSION, now,
        );
      }
      await setSetting(db, 'dictionary.version', DICTIONARY_VERSION);
    });
  }
}

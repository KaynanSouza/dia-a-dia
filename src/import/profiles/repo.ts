import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { BUILTIN_PROFILES, GENERIC_PROFILE } from './builtin';
import type { ImportProfile, ProfileConfig, StatementKind } from './types';

type Row = { id: string; name: string; bank: string; kind: StatementKind; config: string; signature: string };

export async function listCustomProfiles(db: SQLiteDatabase): Promise<ImportProfile[]> {
  const rows = await db.getAllAsync<Row>('SELECT id, name, bank, kind, config, signature FROM import_profiles ORDER BY updated_at DESC;');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    bank: r.bank,
    kind: r.kind,
    builtin: false,
    signature: r.signature.split('|').filter(Boolean),
    config: JSON.parse(r.config) as ProfileConfig,
  }));
}

export async function findProfile(db: SQLiteDatabase, id: string): Promise<ImportProfile | null> {
  if (id === 'generic-checking') return GENERIC_PROFILE('checking');
  if (id === 'generic-credit_card') return GENERIC_PROFILE('credit_card');
  return BUILTIN_PROFILES.find((p) => p.id === id) ?? (await listCustomProfiles(db)).find((p) => p.id === id) ?? null;
}

/** Salva (ou atualiza, se a assinatura já existir) um perfil customizado a partir do mapeamento manual. */
export async function saveCustomProfile(
  db: SQLiteDatabase,
  p: { name: string; bank: string; kind: StatementKind; signature: string[]; config: ProfileConfig },
): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO import_profiles (id, name, bank, kind, config, signature, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (signature, kind) DO UPDATE SET name = excluded.name, bank = excluded.bank, config = excluded.config, updated_at = excluded.updated_at;`,
    id, p.name.trim().slice(0, 60), p.bank.trim().slice(0, 40) || 'Outro', p.kind, JSON.stringify(p.config), p.signature.join('|'), now, now,
  );
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM import_profiles WHERE signature = ? AND kind = ?;', p.signature.join('|'), p.kind);
  return row!.id;
}

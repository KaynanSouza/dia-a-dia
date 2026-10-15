import type { SQLiteDatabase } from 'expo-sqlite';

import { CAT } from '@/categorization/builtin/categories';
import type { CategorySource } from '@/categorization/engine';
import { createEngine } from '@/categorization/factory';
import type { Installment } from '@/categorization/normalize';
import { dedupHash, OccurrenceCounter } from '@/core/dedup/fingerprint';
import { InvalidUtf8Error } from '@/lib/text';
import { IMPORT_LIMITS, ImportError } from './limits';
import { importProgress } from './progress-store';
import { isRowError, mapRow, type MappedRow, type RowError } from './row-mapper';
import { TimeSlicer } from './scheduler';
import type { ImportSession } from './session';
import { CsvTokenizer } from './stream/csv-tokenizer';
import { FileTextStream } from './stream/reader';

export type TxType = 'expense' | 'income' | 'transfer' | 'card_payment';

export type PlannedRow = MappedRow & {
  occurrence: number;
  dedupHash: string;
  merchantKey: string;
  categoryId: string | null;
  source: CategorySource;
  confidence: number | null;
  installment: Installment | null;
  transferHint: boolean;
  type: TxType;
};

export type ImportPlan = {
  fileSha256: string;
  rowsTotal: number;
  fresh: PlannedRow[];
  duplicates: number;
  errors: RowError[];
  alreadyImported: boolean;
  categorized: number;
  coverage: number; // 0..1 sobre `fresh`
  bySource: Record<CategorySource, number>;
  ruleHits: [string, number][];
  sumCents: number;
};

async function parseFile(session: ImportSession, slicer: TimeSlicer) {
  const rows: MappedRow[] = [];
  const errors: RowError[] = [];
  let lineNo = 0;
  const stream = new FileTextStream(session.file, session.encoding, (read, total) =>
    importProgress.set({ stage: 'reading', ratio: total ? read / total : 0, rows: rows.length }),
  );
  const tok = new CsvTokenizer(session.delimiter);
  const mapping = session.mapping!;
  const onRow = (cols: string[]) => {
    const idx = lineNo++;
    if (idx <= session.headerRow) return;
    if (rows.length + errors.length >= IMPORT_LIMITS.maxRows) throw new ImportError('too_many_rows');
    const r = mapRow(cols, idx + 1, mapping);
    if (!r) return;
    if (isRowError(r)) errors.push(r);
    else rows.push(r);
  };

  for await (const text of stream) {
    tok.push(text, onRow);
    await slicer.tick();
  }
  tok.end(onRow);
  return { rows, errors, sha: stream.digest! };
}

/**
 * Análise (sem escrita): streaming do CSV → mapeamento → hash de idempotência → deduplicação →
 * categorização em camadas. Fatiado no tempo para não travar a UI; cancelável.
 */
export async function analyze(db: SQLiteDatabase, session: ImportSession): Promise<ImportPlan> {
  const slicer = new TimeSlicer(8, session.abort.signal);

  // 1. Leitura + parsing (se o UTF-8 quebrar no meio do arquivo, recomeça como Windows-1252)
  let parsed;
  try {
    parsed = await parseFile(session, slicer);
  } catch (e) {
    if (!(e instanceof InvalidUtf8Error)) throw e;
    session.encoding = 'windows-1252';
    parsed = await parseFile(session, slicer);
  }
  if (!parsed.rows.length) throw new ImportError('no_rows');

  // 2. Hash de idempotência (ocorrência por tupla dentro do arquivo)
  importProgress.set({ stage: 'deduplicating', ratio: 0 });
  const counter = new OccurrenceCounter();
  const hashed = [];
  for (const [i, r] of parsed.rows.entries()) {
    const occurrence = counter.next(r.postedOn, r.amountCents, r.descriptionNorm);
    hashed.push({ ...r, occurrence, dedupHash: dedupHash(session.accountId, r.postedOn, r.amountCents, r.descriptionNorm, occurrence) });
    if (i % 500 === 0) importProgress.set({ ratio: (i / parsed.rows.length) * 0.5 });
    await slicer.tick();
  }

  // 3. Deduplicação contra o ledger
  const existing = new Set<string>();
  for (let i = 0; i < hashed.length; i += 500) {
    const chunk = hashed.slice(i, i + 500).map((r) => r.dedupHash);
    const found = await db.getAllAsync<{ dedup_hash: string }>(
      `SELECT dedup_hash FROM transactions WHERE dedup_hash IN (${chunk.map(() => '?').join(',')});`,
      ...chunk,
    );
    found.forEach((f) => existing.add(f.dedup_hash));
    importProgress.set({ ratio: 0.5 + (i / hashed.length) * 0.5 });
  }
  const freshRows = hashed.filter((r) => !existing.has(r.dedupHash));
  const already = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM import_logs WHERE account_id = ? AND file_sha256 = ? AND status = 'committed';",
    session.accountId, parsed.sha,
  );

  // 4. Categorização em camadas
  importProgress.set({ stage: 'categorizing', ratio: 0 });
  const engine = await createEngine(db);
  const kinds = new Map(
    (await db.getAllAsync<{ id: string; kind: TxType }>('SELECT id, kind FROM categories;')).map((c) => [c.id, c.kind]),
  );
  const fresh: PlannedRow[] = [];
  let sumCents = 0;
  for (const [i, r] of freshRows.entries()) {
    const c = engine.categorize({
      description: r.description, amountCents: r.amountCents, accountId: session.accountId, accountKind: session.accountKind,
    });
    const kind = c.categoryId ? kinds.get(c.categoryId) : undefined;
    // Tipo vem da categoria (estorno em "Restaurantes" abate despesa); sem categoria, do sinal
    const type: TxType = kind ?? (r.amountCents < 0 ? 'expense' : 'income');
    fresh.push({
      ...r,
      merchantKey: c.normalized.merchantKey,
      categoryId: c.categoryId,
      source: c.source,
      confidence: c.confidence,
      installment: c.normalized.installment,
      transferHint: (c.normalized.flags.transfer || c.normalized.flags.pix) && c.categoryId !== CAT.CARD_PAYMENT,
      type,
    });
    sumCents += r.amountCents;
    if (i % 250 === 0) importProgress.set({ ratio: i / freshRows.length, rows: i });
    await slicer.tick();
  }

  const categorized = fresh.filter((r) => r.categoryId).length;
  return {
    fileSha256: parsed.sha,
    rowsTotal: parsed.rows.length + parsed.errors.length,
    fresh,
    duplicates: hashed.length - freshRows.length,
    errors: parsed.errors,
    alreadyImported: !!already,
    categorized,
    coverage: fresh.length ? categorized / fresh.length : 1,
    bySource: { user_rule: engine.stats.user_rule, dictionary: engine.stats.dictionary, fuzzy: engine.stats.fuzzy, ml: engine.stats.ml, none: engine.stats.none },
    ruleHits: [...engine.stats.ruleHits.entries()],
    sumCents,
  };
}

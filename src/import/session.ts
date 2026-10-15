import { randomUUID } from 'expo-crypto';
import { File, FileMode } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { dirs, ensureDir } from '@/lib/files';
import { copyPickedTo, FileAccessError, FileTooLargeError, pickDocument, releasePicked, type PickedDocument } from '@/lib/picked-file';
import { decodeUtf16, detectUtf16, utf8Encode } from '@/lib/text';
import { logError } from '@/logging/logger';
import { IMPORT_LIMITS, ImportError } from './limits';
import { detectProfile, resolveMapping } from './profiles/detect';
import { listCustomProfiles } from './profiles/repo';
import type { Delimiter, Encoding, ImportProfile, ProfileConfig, ResolvedMapping, StatementKind } from './profiles/types';
import type { ImportPlan } from './analyze';
import { sniffHead } from './sniff';
import { readHead } from './stream/reader';

export type ImportSession = {
  id: string;
  file: File;
  /** nome original (só para exibição) */
  fileName: string;
  bytes: number;
  accountId: string;
  accountKind: StatementKind;
  encoding: Encoding;
  delimiter: Delimiter;
  headerRow: number;
  headers: string[];
  sample: string[][];
  profile: ImportProfile | null;
  profileId: string;
  mapping: ResolvedMapping | null;
  plan: ImportPlan | null;
  abort: AbortController;
};

let current: ImportSession | null = null;

export const getSession = () => current;

/**
 * Passo 1 (upload): seletor do sistema → cópia para a pasta PRIVADA de imports → limites →
 * sniffing (encoding, delimitador, cabeçalho) → auto-detecção de perfil.
 * Sem filtro de MIME: no Android, CSV vindo de e-mail/Drive/WhatsApp costuma chegar como
 * application/octet-stream e ficaria cinza no seletor. O conteúdo é validado em sniffHead().
 */
export async function startSession(db: SQLiteDatabase, accountId: string): Promise<ImportSession | null> {
  const doc = await pickDocument('*/*');
  if (!doc) return null;
  return loadSession(db, accountId, doc);
}

export async function loadSession(db: SQLiteDatabase, accountId: string, doc: PickedDocument): Promise<ImportSession> {
  discardSession();
  const id = randomUUID();
  const file = new File(ensureDir(dirs.imports()), `${id}.csv`);

  try {
    let bytes: number;
    try {
      bytes = await copyPickedTo(doc, file, IMPORT_LIMITS.maxBytes * 2); // UTF-16 ocupa o dobro antes da conversão
    } catch (e) {
      if (e instanceof FileTooLargeError) throw new ImportError('too_large');
      if (e instanceof FileAccessError) {
        logError('import.file_access', e);
        throw new ImportError('file_access', e.detail);
      }
      throw e;
    } finally {
      releasePicked(doc);
    }
    if (bytes === 0) throw new ImportError('empty');

    const utf16 = detectUtf16(readHead(file, 4096));
    if (utf16) bytes = await convertUtf16ToUtf8(file, utf16);
    if (bytes > IMPORT_LIMITS.maxBytes) throw new ImportError('too_large');

    const account = await db.getFirstAsync<{ kind: string }>('SELECT kind FROM accounts WHERE id = ?;', accountId);
    const accountKind: StatementKind = account?.kind === 'credit_card' ? 'credit_card' : 'checking';

    const head = readHead(file);
    const sn = sniffHead(head, head.length >= bytes);

    const profile = sn.detectedHeaderRow >= 0 ? detectProfile(sn.headers, accountKind, await listCustomProfiles(db)) : null;
    let mapping: ResolvedMapping | null = null;
    if (profile) {
      try {
        mapping = resolveMapping(sn.headers, profile.config);
      } catch {}
    }

    current = {
      id, file, fileName: doc.name, bytes, accountId, accountKind,
      encoding: sn.encoding, delimiter: sn.delimiter, headerRow: sn.headerRow, headers: sn.headers,
      sample: sn.rows.slice(sn.headerRow + 1, sn.headerRow + 11),
      profile: mapping ? profile : null,
      profileId: mapping && profile ? profile.id : `generic-${accountKind}`,
      mapping, plan: null, abort: new AbortController(),
    };
    return current;
  } catch (e) {
    if (file.exists) file.delete();
    throw e;
  }
}

/** Reescreve o arquivo UTF-16 como UTF-8 em blocos (o resto do pipeline só conhece UTF-8/CP1252). */
async function convertUtf16ToUtf8(file: File, order: 'le' | 'be'): Promise<number> {
  const out = new File(file.parentDirectory, `${file.name}.utf8`);
  if (out.exists) out.delete();
  out.create();
  const input = file.open(FileMode.ReadOnly);
  const output = out.open(FileMode.Truncate);
  let written = 0;
  let carry = '';
  let first = true;
  try {
    for (;;) {
      const chunk = input.readBytes(64 * 1024); // par: não corta unidades de 16 bits
      if (!chunk.length) break;
      let text = carry + decodeUtf16(chunk, order, first);
      first = false;
      carry = '';
      const last = text.charCodeAt(text.length - 1);
      if (last >= 0xd800 && last <= 0xdbff) {
        carry = text.slice(-1); // par substituto cortado na fronteira
        text = text.slice(0, -1);
      }
      const enc = utf8Encode(text);
      written += enc.length;
      if (written > IMPORT_LIMITS.maxBytes) throw new ImportError('too_large');
      output.writeBytes(enc);
    }
    if (carry) {
      const enc = utf8Encode(carry);
      written += enc.length;
      output.writeBytes(enc);
    }
  } finally {
    input.close();
    output.close();
  }
  file.delete();
  await out.move(file);
  return written;
}

/** Passo 2 (mapping): aplica perfil escolhido ou mapeamento manual. */
export function applyMapping(config: ProfileConfig, profile: ImportProfile | null, profileId: string) {
  if (!current) throw new ImportError('mapping');
  try {
    current.mapping = resolveMapping(current.headers, config);
  } catch {
    throw new ImportError('mapping');
  }
  current.profile = profile;
  current.profileId = profileId;
  current.plan = null;
}

/** Cancela e apaga o CSV (C-01/F-03: nada fica para trás). */
export function discardSession() {
  if (!current) return;
  current.abort.abort();
  if (current.file.exists) current.file.delete();
  current = null;
}

/** Após o commit: apaga o CSV original mas mantém o resultado para a tela de progresso. */
export function finishSession() {
  if (current?.file.exists) current.file.delete();
  current = null;
}

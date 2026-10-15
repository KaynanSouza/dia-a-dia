import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

type Fingerprintable = { postedOn: string; amountCents: number; descriptionNorm: string };

/**
 * Fingerprint determinístico por conta. Inclui o índice de ocorrência da tupla (data, valor, descrição)
 * dentro do arquivo: dois cafés iguais no mesmo dia continuam sendo duas transações, e reimportar o
 * mesmo extrato (ou um período sobreposto) gera os mesmos fingerprints → deduplicação.
 */
export function assignFingerprints<T extends Fingerprintable>(accountId: string, rows: T[]): (T & { fingerprint: string })[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.postedOn}|${r.amountCents}|${r.descriptionNorm}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...r, fingerprint: bytesToHex(sha256(utf8ToBytes(`v1|${accountId}|${base}|${n}`))) };
  });
}

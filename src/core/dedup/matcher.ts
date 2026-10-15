/** Separa novas × duplicadas dado o conjunto de fingerprints já gravados. */
export function splitDuplicates<T extends { fingerprint: string }>(rows: T[], existing: Set<string>) {
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const r of rows) (existing.has(r.fingerprint) ? duplicates : fresh).push(r);
  return { fresh, duplicates };
}

import { Directory, File, Paths } from 'expo-file-system';

/** Pastas privadas do app (sandbox; sem acesso de outros apps). */
export const dirs = {
  backupWork: () => new Directory(Paths.cache, 'backup-work'),
  backupOut: () => new Directory(Paths.cache, 'backup-out'),
  restoreWork: () => new Directory(Paths.cache, 'restore-work'),
  dataExport: () => new Directory(Paths.cache, 'data-export'),
  imports: () => new Directory(Paths.document, 'imports'), // CSVs pendentes (retenção máx. 30 dias)
};

export function ensureDir(d: Directory) {
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

export function freshFile(dir: Directory, name: string) {
  const f = new File(ensureDir(dir), name);
  if (f.exists) f.delete();
  f.create();
  return f;
}

export function removeDir(d: Directory) {
  if (d.exists) d.delete();
}

/** Apaga arquivos de `dir` mais velhos que maxAgeMs. Retorna quantos removeu. */
export function purgeOlderThan(dir: Directory, maxAgeMs: number): number {
  if (!dir.exists) return 0;
  let n = 0;
  for (const entry of dir.list()) {
    if (entry instanceof File && Date.now() - (entry.modificationTime ?? 0) > maxAgeMs) {
      entry.delete();
      n++;
    }
  }
  return n;
}

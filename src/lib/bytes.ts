export const u32be = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
};

export const readU32be = (b: Uint8Array, off: number) => new DataView(b.buffer, b.byteOffset + off, 4).getUint32(0, false);

/** Comparação em tempo constante. */
export function ctEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/** file:///… → /… (ATTACH do SQLite e o diretório do expo-sqlite exigem caminho de FS) */
export const toFsPath = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ''));

/** /… → file:///… (inverso de toFsPath) */
export const toFileUri = (path: string) => (path.startsWith('file://') ? path : `file://${encodeURI(path)}`);

/** Literal SQL seguro para caminhos. */
export const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** "1.234,56" | "-1234.56" | "R$ 1.234,56" | "(12,00)" | "12,00 D" → centavos (inteiro). null se inválido. */
export function parseAmountCents(raw: string): number | null {
  let s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\s?D$/i.test(s)) {
    negative = true;
    s = s.replace(/\s?D$/i, '');
  } else s = s.replace(/\s?C$/i, '');
  s = s.replace(/R\$|BRL/gi, '').replace(/\s/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  // O último separador com 1–2 dígitos depois é o decimal
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let intPart = s;
  let decPart = '';
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    intPart = s.slice(0, lastSep);
    decPart = s.slice(lastSep + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  if (!intPart && !decPart) return null;
  const cents = Number(intPart || '0') * 100 + Number(decPart.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** dd/mm/aaaa | dd/mm/aa | dd-mm-aaaa | aaaa-mm-dd → "aaaa-mm-dd". null se inválida. */
export function parseDate(raw: string): string | null {
  const s = raw.trim().slice(0, 10);
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += y >= 70 ? 1900 : 2000;
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Minúsculas, sem acentos, sem pontuação repetida, espaços colapsados. */
export function normalizeDescription(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9*/ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

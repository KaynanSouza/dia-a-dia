const FORBIDDEN_KEY =
  /amount|valor|saldo|balance|desc|memo|payee|account|conta|card|cart|iban|cpf|agencia|pin|senha|password|key|token|name|nome/i;
const SAFE_STRING = /^[a-z0-9_.:-]{1,64}$/i;

/**
 * Allowlist (default deny): só inteiros, booleanos e códigos curtos sem sequências de 4+ dígitos.
 * Garante F-03/F-05: nada de valores, descrições ou números de conta no event_log.
 */
export function sanitize(ctx: object): Record<string, string | number | boolean> | null {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (FORBIDDEN_KEY.test(k)) continue;
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isInteger(v))) out[k] = v;
    else if (typeof v === 'string' && SAFE_STRING.test(v) && !/\d{4,}/.test(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

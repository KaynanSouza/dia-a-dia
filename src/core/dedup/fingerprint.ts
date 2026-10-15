import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Chave de idempotência (C-03): sha256("v1|conta|data|centavos|descrição_norm|ocorrência").
 * `occurrence` = n-ésima vez que a tupla (data, valor, descrição) aparece NO ARQUIVO: dois cafés
 * iguais no mesmo dia são duas transações; reimportar o mesmo extrato (ou período sobreposto)
 * gera os mesmos hashes. Formato congelado: mudar invalida a deduplicação de dados existentes.
 */
export function dedupHash(accountId: string, postedOn: string, amountCents: number, descriptionNorm: string, occurrence: number) {
  return bytesToHex(sha256(utf8ToBytes(`v1|${accountId}|${postedOn}|${amountCents}|${descriptionNorm}|${occurrence}`)));
}

/** Contador de ocorrências por tupla dentro de um arquivo. */
export class OccurrenceCounter {
  private seen = new Map<string, number>();
  next(postedOn: string, amountCents: number, descriptionNorm: string): number {
    const k = `${postedOn}|${amountCents}|${descriptionNorm}`;
    const n = (this.seen.get(k) ?? 0) + 1;
    this.seen.set(k, n);
    return n;
  }
}

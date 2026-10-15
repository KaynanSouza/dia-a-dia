import type { ImportProfile } from './types';

/**
 * Perfis embutidos no bundle. Layouts baseados nos exports CSV mais comuns de cada banco;
 * quando o banco muda o formato, o assistente cai no perfil genérico ou no mapeamento manual
 * (que pode ser salvo como perfil customizado em import_profiles).
 */
const SALDO = ['^saldo\\b', '^s a l d o\\b', '^total\\b'];

export const BUILTIN_PROFILES: ImportProfile[] = [
  {
    id: 'nubank-conta', name: 'Nubank — Conta', bank: 'Nubank', kind: 'checking', builtin: true,
    signature: ['data', 'valor', 'identificador', 'descricao'],
    config: { delimiter: ',', dateFormat: 'dmy', amountSign: 'as_is', columns: { date: ['data'], description: ['descricao'], amount: ['valor'] } },
  },
  {
    id: 'nubank-cartao', name: 'Nubank — Cartão', bank: 'Nubank', kind: 'credit_card', builtin: true,
    signature: ['date', 'title', 'amount'],
    config: { delimiter: ',', dateFormat: 'ymd', amountSign: 'invert', columns: { date: ['date'], description: ['title'], amount: ['amount'] } },
  },
  {
    id: 'itau-conta', name: 'Itaú — Conta', bank: 'Itaú', kind: 'checking', builtin: true,
    signature: ['data', 'lancamento', 'valor'],
    config: { delimiter: ';', dateFormat: 'dmy', amountSign: 'as_is', skip: SALDO, columns: { date: ['data'], description: ['lancamento'], amount: ['valor'] } },
  },
  {
    id: 'itau-cartao', name: 'Itaú — Cartão', bank: 'Itaú', kind: 'credit_card', builtin: true,
    signature: ['data', 'lancamento', 'valor'],
    config: { delimiter: ';', dateFormat: 'dmy', amountSign: 'invert', skip: SALDO, columns: { date: ['data'], description: ['lancamento'], amount: ['valor'] } },
  },
  {
    id: 'bradesco-conta', name: 'Bradesco — Conta', bank: 'Bradesco', kind: 'checking', builtin: true,
    signature: ['data', 'historico', 'credito', 'debito'],
    config: {
      delimiter: ';', dateFormat: 'dmy', amountSign: 'as_is', skip: SALDO,
      columns: { date: ['data'], description: ['historico'], descriptionExtra: ['docto', 'documento'], credit: ['credito'], debit: ['debito'] },
    },
  },
  {
    id: 'bradesco-cartao', name: 'Bradesco — Cartão', bank: 'Bradesco', kind: 'credit_card', builtin: true,
    signature: ['data', 'historico', 'valor'],
    config: { delimiter: ';', dateFormat: 'dmy', amountSign: 'invert', skip: SALDO, columns: { date: ['data'], description: ['historico'], amount: ['valor', 'valorrs'] } },
  },
  {
    id: 'bb-conta', name: 'Banco do Brasil — Conta', bank: 'Banco do Brasil', kind: 'checking', builtin: true,
    signature: ['data', 'lancamento', 'detalhes', 'valor'],
    config: {
      delimiter: ',', dateFormat: 'dmy', amountSign: 'as_is', skip: SALDO,
      columns: { date: ['data'], description: ['lancamento'], descriptionExtra: ['detalhes'], amount: ['valor'] },
    },
  },
  {
    id: 'bb-cartao', name: 'Banco do Brasil — Cartão', bank: 'Banco do Brasil', kind: 'credit_card', builtin: true,
    signature: ['data', 'descricao', 'valor', 'pais'],
    config: { delimiter: ';', dateFormat: 'dmy', amountSign: 'invert', columns: { date: ['data'], description: ['descricao'], amount: ['valor', 'valorrs'] } },
  },
  {
    id: 'caixa-conta', name: 'Caixa — Conta', bank: 'Caixa', kind: 'checking', builtin: true,
    signature: ['datamov', 'historico', 'valor', 'debcred'],
    config: {
      delimiter: ';', dateFormat: 'ymd_compact', amountSign: 'as_is', skip: SALDO,
      columns: { date: ['datamov'], description: ['historico'], amount: ['valor'], dcFlag: { column: ['debcred'], debitValues: ['d'] } },
    },
  },
  {
    id: 'inter-conta', name: 'Inter — Conta', bank: 'Inter', kind: 'checking', builtin: true,
    signature: ['datalancamento', 'historico', 'descricao', 'valor'],
    config: {
      delimiter: ';', dateFormat: 'dmy', amountSign: 'as_is', skip: SALDO,
      columns: { date: ['datalancamento'], description: ['descricao'], descriptionExtra: ['historico'], amount: ['valor'] },
    },
  },
  {
    id: 'inter-cartao', name: 'Inter — Cartão', bank: 'Inter', kind: 'credit_card', builtin: true,
    signature: ['data', 'lancamento', 'categoria', 'tipo', 'valor'],
    config: { delimiter: ',', dateFormat: 'dmy', amountSign: 'invert', columns: { date: ['data'], description: ['lancamento'], amount: ['valor'] } },
  },
];

/** Fallback: aliases amplos para extratos de qualquer banco. */
export const GENERIC_PROFILE = (kind: 'checking' | 'credit_card'): ImportProfile => ({
  id: `generic-${kind}`, name: 'Genérico', bank: 'Outro', kind, builtin: true, signature: [],
  config: {
    dateFormat: 'auto', amountSign: kind === 'credit_card' ? 'invert' : 'as_is', skip: SALDO,
    columns: {
      date: ['data', 'date', 'datalancamento', 'datamovimento', 'dtlancamento', 'dataoperacao', 'datamov', 'datacompra'],
      description: ['descricao', 'historico', 'description', 'lancamento', 'memo', 'estabelecimento', 'titulo', 'title', 'detalhe'],
      amount: ['valor', 'amount', 'valorrs', 'valorbrl', 'quantia', 'valoremreais'],
      debit: ['debito', 'saida', 'debit'],
      credit: ['credito', 'entrada', 'credit'],
    },
  },
});

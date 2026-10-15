/**
 * C-06: agregações em SQL puro. Todas filtram por range semiaberto de posted_on e por `type`,
 * usando idx_tx_dashboard (posted_on, type, category_id, amount_cents) como índice de cobertura.
 * Transferências e pagamentos de fatura ficam de fora (type) → sem contagem dupla.
 * Despesas são somadas com sinal (estornos abatem); exibidas como valor positivo (-sum).
 */

// Raiz de cada categoria, em qualquer profundidade da árvore
const ROOTS = /* sql */ `
  roots(id, root_id) AS (
    SELECT id, id FROM categories WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, r.root_id FROM categories c JOIN roots r ON c.parent_id = r.id
  )`;

/** Visão mensal: receitas, despesas e resultado do mês. Params: [start, end] */
export const SQL_MONTH_OVERVIEW = /* sql */ `
SELECT
  coalesce(sum(CASE WHEN type = 'income'  THEN amount_cents END), 0)  AS income_cents,
  coalesce(-sum(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense_cents,
  coalesce(sum(amount_cents), 0)                                      AS net_cents,
  count(*)                                                            AS tx_count,
  coalesce(sum(CASE WHEN type = 'expense' AND category_id IS NULL THEN 1 END), 0) AS uncategorized_count
FROM transactions
WHERE posted_on >= ? AND posted_on < ? AND type IN ('income', 'expense');`;

/** Série dos últimos N meses (gráfico). Params: [start, end] */
export const SQL_MONTHLY_SERIES = /* sql */ `
SELECT substr(posted_on, 1, 7) AS ym,
       coalesce(sum(CASE WHEN type = 'income'  THEN amount_cents END), 0)  AS income_cents,
       coalesce(-sum(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense_cents
FROM transactions
WHERE posted_on >= ? AND posted_on < ? AND type IN ('income', 'expense')
GROUP BY ym ORDER BY ym;`;

/** Gastos por categoria raiz (inclui "Sem categoria"). Params: [start, end] */
export const SQL_SPENDING_BY_CATEGORY = /* sql */ `
WITH RECURSIVE ${ROOTS}
SELECT coalesce(r.root_id, '__none')           AS category_id,
       coalesce(rc.name, 'Sem categoria')       AS name,
       rc.color                                 AS color,
       -sum(t.amount_cents)                     AS spent_cents,
       count(*)                                 AS tx_count
FROM transactions t
LEFT JOIN roots r       ON r.id = t.category_id
LEFT JOIN categories rc ON rc.id = r.root_id
WHERE t.posted_on >= ? AND t.posted_on < ? AND t.type = 'expense'
GROUP BY 1 ORDER BY spent_cents DESC;`;

/** DRE simplificado: receitas e despesas por categoria raiz. Params: [start, end] */
export const SQL_DRE = /* sql */ `
WITH RECURSIVE ${ROOTS}
SELECT t.type                                    AS section,
       coalesce(r.root_id, '__none')             AS category_id,
       coalesce(rc.name, CASE t.type WHEN 'income' THEN 'Outras receitas' ELSE 'Sem categoria' END) AS name,
       sum(t.amount_cents)                       AS total_cents
FROM transactions t
LEFT JOIN roots r       ON r.id = t.category_id
LEFT JOIN categories rc ON rc.id = r.root_id
WHERE t.posted_on >= ? AND t.posted_on < ? AND t.type IN ('income', 'expense')
GROUP BY t.type, 2
ORDER BY t.type DESC, abs(sum(t.amount_cents)) DESC;`;

/** Top 10 estabelecimentos por gasto. Params: [start, end] */
export const SQL_TOP_MERCHANTS = /* sql */ `
SELECT t.merchant_key                                  AS merchant_key,
       coalesce(max(d.display_name), t.merchant_key)   AS name,
       -sum(t.amount_cents)                            AS spent_cents,
       count(*)                                        AS tx_count
FROM transactions t
LEFT JOIN merchant_dictionary d ON d.key = t.merchant_key
WHERE t.posted_on >= ? AND t.posted_on < ? AND t.type = 'expense' AND t.merchant_key <> ''
GROUP BY t.merchant_key
ORDER BY spent_cents DESC
LIMIT 10;`;

/** Comparativo com o mês anterior por categoria raiz. Params: [prevStart, curStart, curEnd] */
export const SQL_MONTH_COMPARISON = /* sql */ `
WITH RECURSIVE ${ROOTS},
params(prev_start, cur_start, cur_end) AS (SELECT ?, ?, ?)
SELECT coalesce(r.root_id, '__none')     AS category_id,
       coalesce(rc.name, 'Sem categoria') AS name,
       coalesce(-sum(CASE WHEN t.posted_on >= p.cur_start THEN t.amount_cents END), 0) AS current_cents,
       coalesce(-sum(CASE WHEN t.posted_on <  p.cur_start THEN t.amount_cents END), 0) AS previous_cents
FROM params p
JOIN transactions t     ON t.posted_on >= p.prev_start AND t.posted_on < p.cur_end AND t.type = 'expense'
LEFT JOIN roots r       ON r.id = t.category_id
LEFT JOIN categories rc ON rc.id = r.root_id
GROUP BY 1
ORDER BY current_cents DESC;`;

/** Lista de lançamentos do período (mesmo filtro do dashboard) para o teste de reconciliação. Params: [start, end] */
export const SQL_EXPENSE_LIST_TOTAL = /* sql */ `
SELECT coalesce(-sum(amount_cents), 0) AS total_cents, count(*) AS tx_count
FROM transactions WHERE posted_on >= ? AND posted_on < ? AND type = 'expense';`;

import type { SQLiteDatabase } from 'expo-sqlite';

import { monthRange, shiftMonth } from '@/lib/time';
import {
  SQL_DRE,
  SQL_EXPENSE_LIST_TOTAL,
  SQL_MONTH_COMPARISON,
  SQL_MONTH_OVERVIEW,
  SQL_MONTHLY_SERIES,
  SQL_SPENDING_BY_CATEGORY,
  SQL_TOP_MERCHANTS,
} from './queries';

export type Overview = { income_cents: number; expense_cents: number; net_cents: number; tx_count: number; uncategorized_count: number };
export type CategorySpend = { category_id: string; name: string; color: string | null; spent_cents: number; tx_count: number };
export type DreLine = { section: 'income' | 'expense'; category_id: string; name: string; total_cents: number };
export type MerchantSpend = { merchant_key: string; name: string; spent_cents: number; tx_count: number };
export type Comparison = { category_id: string; name: string; current_cents: number; previous_cents: number };
export type SeriesPoint = { ym: string; income_cents: number; expense_cents: number };

export type Dashboard = {
  ym: string;
  overview: Overview;
  previous: Overview;
  byCategory: CategorySpend[];
  dre: DreLine[];
  topMerchants: MerchantSpend[];
  comparison: Comparison[];
  series: SeriesPoint[];
  reconciled: boolean;
  ms: number;
};

/** Carga do dashboard: 7 consultas indexadas em paralelo (a conexão serializa no nativo). */
export async function loadDashboard(db: SQLiteDatabase, ym: string): Promise<Dashboard> {
  const t0 = Date.now();
  const cur = monthRange(ym);
  const prev = monthRange(shiftMonth(ym, -1));
  const seriesStart = monthRange(shiftMonth(ym, -5)).start;

  const [overview, previous, byCategory, dre, topMerchants, comparison, series, list] = await Promise.all([
    db.getFirstAsync<Overview>(SQL_MONTH_OVERVIEW, cur.start, cur.end),
    db.getFirstAsync<Overview>(SQL_MONTH_OVERVIEW, prev.start, prev.end),
    db.getAllAsync<CategorySpend>(SQL_SPENDING_BY_CATEGORY, cur.start, cur.end),
    db.getAllAsync<DreLine>(SQL_DRE, cur.start, cur.end),
    db.getAllAsync<MerchantSpend>(SQL_TOP_MERCHANTS, cur.start, cur.end),
    db.getAllAsync<Comparison>(SQL_MONTH_COMPARISON, prev.start, cur.start, cur.end),
    db.getAllAsync<SeriesPoint>(SQL_MONTHLY_SERIES, seriesStart, cur.end),
    db.getFirstAsync<{ total_cents: number }>(SQL_EXPENSE_LIST_TOTAL, cur.start, cur.end),
  ]);

  return {
    ym,
    overview: overview!,
    previous: previous!,
    byCategory,
    dre,
    topMerchants,
    comparison,
    series,
    reconciled: isReconciled(byCategory, overview!, list!.total_cents),
    ms: Date.now() - t0,
  };
}

/** Invariante C-06: Σ categorias == Σ lançamentos listados == total de despesas da visão mensal. */
export const isReconciled = (byCategory: CategorySpend[], overview: Overview, listTotal: number) => {
  const sumCategories = byCategory.reduce((s, c) => s + c.spent_cents, 0);
  return sumCategories === listTotal && listTotal === overview.expense_cents;
};

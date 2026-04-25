/**
 * MOD-ANALYTICS — queries de receita, reembolsos, inadimplência e KPIs gerais
 * Consulta materialized views criadas pela migration sprint-10.
 * Zero I/O direto — recebe `db` injetado.
 */

import { db as defaultDb } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type {
  AnalyticsFilters,
  DelinquencyRow,
  OverviewKpis,
  RefundByDayRow,
  SalesByDayRow,
} from '../types'

type Db = typeof defaultDb

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function querySalesByDay(
  filters: AnalyticsFilters,
  db: Db = defaultDb,
): Promise<SalesByDayRow[]> {
  const offerClause = filters.offerId
    ? sql`AND offer_id = ${filters.offerId}::uuid`
    : sql``

  const result = await db.execute(sql`
    SELECT day::text,
           offer_id      AS "offerId",
           offer_name    AS "offerName",
           transactions_count::int   AS "transactionsCount",
           gross_revenue::float      AS "grossRevenue",
           avg_ticket::float         AS "avgTicket"
    FROM mv_sales_by_brand_day
    WHERE brand_id = ${filters.brandId}::uuid
      AND day BETWEEN ${isoDate(filters.from)}::date AND ${isoDate(filters.to)}::date
      ${offerClause}
    ORDER BY day DESC
  `)

  return (result as unknown as SalesByDayRow[])
}

export async function queryRefundsByDay(
  filters: AnalyticsFilters,
  db: Db = defaultDb,
): Promise<RefundByDayRow[]> {
  const result = await db.execute(sql`
    SELECT day::text,
           offer_id          AS "offerId",
           refunds_count::int     AS "refundsCount",
           refunded_amount::float AS "refundedAmount"
    FROM mv_refund_by_brand_day
    WHERE brand_id = ${filters.brandId}::uuid
      AND day BETWEEN ${isoDate(filters.from)}::date AND ${isoDate(filters.to)}::date
    ORDER BY day DESC
  `)

  return (result as unknown as RefundByDayRow[])
}

export async function queryDelinquency(
  filters: AnalyticsFilters,
  db: Db = defaultDb,
): Promise<DelinquencyRow[]> {
  const result = await db.execute(sql`
    SELECT id::text,
           subscription_id::text AS "subscriptionId",
           contact_id::text      AS "contactId",
           offer_id::text        AS "offerId",
           due_at::text          AS "dueAt",
           amount::float,
           days_overdue::int     AS "daysOverdue"
    FROM v_delinquency_aging
    WHERE brand_id = ${filters.brandId}::uuid
    ORDER BY days_overdue DESC
  `)

  return (result as unknown as DelinquencyRow[])
}

export async function queryOverviewKpis(
  filters: AnalyticsFilters,
  db: Db = defaultDb,
): Promise<OverviewKpis> {
  const [salesResult, refundsResult, inboxResult] = await Promise.all([
    db.execute(sql`
      SELECT COALESCE(SUM(gross_revenue), 0)::float        AS revenue,
             COALESCE(SUM(transactions_count), 0)::int     AS count
      FROM mv_sales_by_brand_day
      WHERE brand_id = ${filters.brandId}::uuid
        AND day BETWEEN ${isoDate(filters.from)}::date AND ${isoDate(filters.to)}::date
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(refunds_count), 0)::int AS count
      FROM mv_refund_by_brand_day
      WHERE brand_id = ${filters.brandId}::uuid
        AND day BETWEEN ${isoDate(filters.from)}::date AND ${isoDate(filters.to)}::date
    `),
    db.execute(sql`
      SELECT COALESCE(AVG(avg_response_time_minutes), NULL)::float AS avg_rt,
             COALESCE(SUM(open_count), 0)::int                    AS open_count
      FROM mv_inbox_daily
      WHERE brand_id = ${filters.brandId}::uuid
        AND day BETWEEN ${isoDate(filters.from)}::date AND ${isoDate(filters.to)}::date
    `),
  ])

  const salesRows = salesResult as unknown as Array<Record<string, unknown>>
  const refundsRows = refundsResult as unknown as Array<Record<string, unknown>>
  const inboxRows = inboxResult as unknown as Array<Record<string, unknown>>

  const s = salesRows[0] ?? {}
  const r = refundsRows[0] ?? {}
  const i = inboxRows[0] ?? {}

  const txCount = Number(s['count'] ?? 0)
  const refundCount = Number(r['count'] ?? 0)

  return {
    grossRevenue: Number(s['revenue'] ?? 0),
    transactionsCount: txCount,
    refundRate: txCount > 0 ? refundCount / txCount : 0,
    avgResponseTimeMinutes: i['avg_rt'] != null ? Number(i['avg_rt']) : null,
    openConversations: Number(i['open_count'] ?? 0),
  }
}

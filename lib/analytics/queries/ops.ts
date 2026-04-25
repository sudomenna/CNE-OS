/**
 * MOD-ANALYTICS — queries operacionais: funil, inbox, atribuição de campanha
 * Zero I/O direto — recebe `db` injetado.
 */

import { db as defaultDb } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type {
  AnalyticsFilters,
  CampaignAttributionRow,
  FunnelConversionRow,
  InboxDailyRow,
} from '../types'

type Db = typeof defaultDb

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function queryFunnelConversion(
  filters: AnalyticsFilters,
  db: Db = defaultDb,
): Promise<FunnelConversionRow[]> {
  const funnelClause = filters.funnelId
    ? sql`AND funnel_id = ${filters.funnelId}::uuid`
    : sql``

  const result = await db.execute(sql`
    SELECT funnel_id::text         AS "funnelId",
           funnel_name             AS "funnelName",
           label,
           day::text,
           entries_count::int          AS "entriesCount",
           avg_cycle_time_days::float  AS "avgCycleTimeDays",
           avg_score::float            AS "avgScore"
    FROM mv_funnel_stage_conversion
    WHERE brand_id = ${filters.brandId}::uuid
      AND day BETWEEN ${isoDate(filters.from)}::date AND ${isoDate(filters.to)}::date
      ${funnelClause}
    ORDER BY day DESC, funnel_id
  `)

  return (result as unknown as FunnelConversionRow[])
}

export async function queryInboxDaily(
  filters: AnalyticsFilters,
  db: Db = defaultDb,
): Promise<InboxDailyRow[]> {
  const result = await db.execute(sql`
    SELECT day::text,
           conversations_count::int          AS "conversationsCount",
           open_count::int                   AS "openCount",
           closed_count::int                 AS "closedCount",
           avg_response_time_minutes::float  AS "avgResponseTimeMinutes",
           overdue_count::int                AS "overdueCount"
    FROM mv_inbox_daily
    WHERE brand_id = ${filters.brandId}::uuid
      AND day BETWEEN ${isoDate(filters.from)}::date AND ${isoDate(filters.to)}::date
    ORDER BY day DESC
  `)

  return (result as unknown as InboxDailyRow[])
}

export async function queryCampaignAttribution(
  filters: AnalyticsFilters,
  db: Db = defaultDb,
): Promise<CampaignAttributionRow[]> {
  const campaignClause = filters.campaignId
    ? sql`AND campaign_id = ${filters.campaignId}::uuid`
    : sql``

  const result = await db.execute(sql`
    SELECT campaign_id::text   AS "campaignId",
           campaign_name       AS "campaignName",
           funnel_id::text     AS "funnelId",
           entries_count::int       AS "entriesCount",
           conversions_count::int   AS "conversionsCount",
           conversion_rate::float   AS "conversionRate"
    FROM mv_campaign_attribution
    WHERE brand_id = ${filters.brandId}::uuid
      ${campaignClause}
    ORDER BY conversions_count DESC
  `)

  return (result as unknown as CampaignAttributionRow[])
}

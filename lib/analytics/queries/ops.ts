/**
 * MOD-ANALYTICS — queries operacionais: funil, inbox, atribuição de campanha
 * Zero I/O direto — recebe `db` injetado.
 */

import { db as defaultDb } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type {
  AnalyticsFilters,
  CampaignAttributionRow,
  ConversationAvgResolutionRow,
  ConversationHeatmapRow,
  ConversationSlaRow,
  FunnelConversionRow,
  InboxDailyRow,
  TopAttendantRow,
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

// ---------------------------------------------------------------------------
// T-12-28: Atendimento analytics queries
// ---------------------------------------------------------------------------

/**
 * Heatmap de volume de mensagens inbound por hora × dia da semana.
 * Usa tabela `message` + join `conversation` para filtrar por brand_id.
 * dow: 0=Domingo … 6=Sábado (conforme EXTRACT(dow …) do Postgres).
 */
export async function queryConversationHeatmap(
  filters: Pick<AnalyticsFilters, 'brandId' | 'from' | 'to'>,
  db: Db = defaultDb,
): Promise<ConversationHeatmapRow[]> {
  const result = await db.execute(sql`
    SELECT
      EXTRACT(hour FROM m.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS "hour",
      EXTRACT(dow  FROM m.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS "dow",
      COUNT(*)::int AS "count"
    FROM message m
    JOIN conversation c ON c.id = m.conversation_id
    WHERE c.brand_id    = ${filters.brandId}::uuid
      AND m.direction   = 'inbound'
      AND m.created_at  BETWEEN ${isoDate(filters.from)}::timestamptz
                             AND ${isoDate(filters.to)}::timestamptz + interval '1 day'
      AND c.deleted_at  IS NULL
    GROUP BY 1, 2
    ORDER BY 2, 1
  `)

  return result as unknown as ConversationHeatmapRow[]
}

/**
 * SLA de primeira resposta: % de conversas com primeiro outbound ≤ 15 min após criação.
 * Deriva a primeira mensagem outbound por conversa e compara com conversation.created_at.
 */
export async function queryConversationSla(
  filters: Pick<AnalyticsFilters, 'brandId' | 'from' | 'to'>,
  db: Db = defaultDb,
): Promise<ConversationSlaRow> {
  const result = await db.execute(sql`
    WITH first_outbound AS (
      SELECT
        m.conversation_id,
        MIN(m.created_at) AS first_out_at
      FROM message m
      WHERE m.direction = 'outbound'
      GROUP BY m.conversation_id
    )
    SELECT
      COUNT(c.id)::int AS "total",
      COUNT(fo.conversation_id) FILTER (
        WHERE fo.first_out_at - c.created_at <= interval '15 minutes'
      )::int AS "withinSla",
      CASE WHEN COUNT(c.id) = 0 THEN 0
           ELSE ROUND(
             COUNT(fo.conversation_id) FILTER (
               WHERE fo.first_out_at - c.created_at <= interval '15 minutes'
             )::numeric * 100 / COUNT(c.id), 1
           )
      END::float AS "pct"
    FROM conversation c
    LEFT JOIN first_outbound fo ON fo.conversation_id = c.id
    WHERE c.brand_id   = ${filters.brandId}::uuid
      AND c.created_at BETWEEN ${isoDate(filters.from)}::timestamptz
                            AND ${isoDate(filters.to)}::timestamptz + interval '1 day'
      AND c.deleted_at IS NULL
  `)

  const row = (result as unknown as ConversationSlaRow[])[0]
  return row ?? { total: 0, withinSla: 0, pct: 0 }
}

/**
 * Tempo médio de resolução (em minutos) para conversas fechadas no período.
 * Usa a primeira transição para status='closed' no conversation_status_history.
 */
export async function queryConversationAvgResolution(
  filters: Pick<AnalyticsFilters, 'brandId' | 'from' | 'to'>,
  db: Db = defaultDb,
): Promise<ConversationAvgResolutionRow> {
  const result = await db.execute(sql`
    WITH first_closed AS (
      SELECT
        csh.conversation_id,
        MIN(csh.created_at) AS closed_at
      FROM conversation_status_history csh
      WHERE csh.to_status = 'closed'
      GROUP BY csh.conversation_id
    )
    SELECT
      AVG(
        EXTRACT(epoch FROM fc.closed_at - c.created_at) / 60
      )::float AS "avgMinutes"
    FROM conversation c
    JOIN first_closed fc ON fc.conversation_id = c.id
    WHERE c.brand_id   = ${filters.brandId}::uuid
      AND fc.closed_at BETWEEN ${isoDate(filters.from)}::timestamptz
                            AND ${isoDate(filters.to)}::timestamptz + interval '1 day'
      AND c.deleted_at IS NULL
  `)

  const row = (result as unknown as { avgMinutes: number | null }[])[0]
  return { avgMinutes: row?.avgMinutes ?? null }
}

/**
 * Top 5 atendentes por volume de conversas assignadas no período.
 */
export async function queryTopAttendants(
  filters: Pick<AnalyticsFilters, 'brandId' | 'from' | 'to'>,
  db: Db = defaultDb,
): Promise<TopAttendantRow[]> {
  const result = await db.execute(sql`
    SELECT
      c.assigned_user_id::text   AS "userId",
      COALESCE(u.name, u.email)  AS "userName",
      COUNT(c.id)::int           AS "conversationsCount"
    FROM conversation c
    JOIN user_account u ON u.id = c.assigned_user_id
    WHERE c.brand_id         = ${filters.brandId}::uuid
      AND c.created_at       BETWEEN ${isoDate(filters.from)}::timestamptz
                                 AND ${isoDate(filters.to)}::timestamptz + interval '1 day'
      AND c.assigned_user_id IS NOT NULL
      AND c.deleted_at       IS NULL
    GROUP BY c.assigned_user_id, u.name, u.email
    ORDER BY "conversationsCount" DESC
    LIMIT 5
  `)

  return result as unknown as TopAttendantRow[]
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

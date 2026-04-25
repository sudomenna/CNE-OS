/**
 * T-10-05 — Inngest cron: analytics-refresh-hourly
 *
 * Roda a cada hora. Executa REFRESH MATERIALIZED VIEW CONCURRENTLY para as 5
 * MVs analíticas do projeto. Cada REFRESH é um step independente — falha em
 * uma MV não bloqueia as demais.
 *
 * MVs atualizadas:
 *   - mv_sales_by_brand_day
 *   - mv_refund_by_brand_day
 *   - mv_funnel_stage_conversion
 *   - mv_inbox_daily
 *   - mv_campaign_attribution
 *
 * docs/10-architecture/04-integrations-canonical.md
 */
import { sql } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'

const VIEWS = [
  'mv_sales_by_brand_day',
  'mv_refund_by_brand_day',
  'mv_funnel_stage_conversion',
  'mv_inbox_daily',
  'mv_campaign_attribution',
] as const

type ViewName = (typeof VIEWS)[number]

export const analyticsRefreshHourly = inngest.createFunction(
  {
    id: 'analytics-refresh-hourly',
    name: 'Analytics: Refresh Materialized Views',
    retries: 2,
    concurrency: { limit: 1 }, // evita overlap de rodadas simultâneas
  },
  { cron: '0 * * * *' },
  async ({ step, logger }) => {
    const results = await Promise.allSettled(
      VIEWS.map((view: ViewName) =>
        step.run(`refresh-${view}`, async () => {
          const start = Date.now()
          await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY ${sql.identifier(view)}`)
          const duration = Date.now() - start
          logger.info(`Refreshed ${view} in ${duration}ms`)
          return { view, duration }
        }),
      ),
    )

    const summary = results.map((r, i) => ({
      view: VIEWS[i],
      ok: r.status === 'fulfilled',
      error: r.status === 'rejected' ? String((r as PromiseRejectedResult).reason) : null,
    }))

    return { refreshed: summary }
  },
)

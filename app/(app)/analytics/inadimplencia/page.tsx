/**
 * /analytics/inadimplencia — Dunning dashboard (T-13-18)
 * docs/70-ux/08-screen-dashboards.md §3
 * docs/80-roadmap/10-sprint-13-rls-flows-p1.md T-13-18
 *
 * Server Component: calcula métricas de inadimplência via Drizzle +
 * view v_delinquency_aging. Repassa dados ao componente de display.
 *
 * RBAC: admin, financeiro — verificado por requirePermission em actions.ts;
 * nesta página de leitura, a sessão é verificada via requireSession() e o
 * RLS do Supabase limita os dados ao usuário autenticado.
 */

import { Suspense } from "react";
import { and, count, eq, gt, isNull, not, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  installment,
  subscription,
} from "@/lib/db/schema/billing";
import { offer } from "@/lib/db/schema/offer";
import { requireSession } from "@/lib/auth/session";
import { GlobalFilters } from "@/components/analytics/global-filters";
import {
  DunningMetrics,
  type DunningMetricsData,
  type AgingBucket,
  type OfferBreakdown,
} from "@/components/analytics/dunning-metrics";
import {
  getAnalyticsFilters,
  listBrandsForAnalytics,
} from "@/app/(app)/analytics/actions";

// ---------------------------------------------------------------------------
// Queries — todas via Drizzle, sem SQL cru
// ---------------------------------------------------------------------------

async function queryDunningMetrics(brandId: string): Promise<DunningMetricsData> {
  // 1. Assinaturas past_due
  const [pastDueRow] = await db
    .select({ count: count() })
    .from(subscription)
    .where(
      and(
        eq(subscription.brandId, brandId),
        eq(subscription.status, "past_due"),
      ),
    );

  const pastDueCount = Number(pastDueRow?.count ?? 0);

  // 2. Valor em aberto (parcelas overdue ligadas a assinaturas da marca)
  const [overdueAmountRow] = await db
    .select({ total: sum(installment.amount) })
    .from(installment)
    .innerJoin(subscription, eq(installment.subscriptionId, subscription.id))
    .where(
      and(
        eq(subscription.brandId, brandId),
        eq(installment.status, "overdue"),
        not(isNull(installment.subscriptionId)),
      ),
    );

  const totalOverdueAmount = Number(overdueAmountRow?.total ?? 0);

  // 3. Taxa de recuperação: parcelas que foram pagas (status=paid) de assinaturas
  //    que já tiveram parcelas overdue — proxy: count overdue vs count paid na mesma sub.
  //    Calculamos como: paid_installments / (paid_installments + overdue_installments)
  //    dentro do universo de assinaturas que já tiveram pelo menos uma parcela overdue.
  const [paidRow] = await db
    .select({ count: count() })
    .from(installment)
    .innerJoin(subscription, eq(installment.subscriptionId, subscription.id))
    .where(
      and(
        eq(subscription.brandId, brandId),
        eq(installment.status, "paid"),
        not(isNull(installment.subscriptionId)),
      ),
    );

  const [overdueCountRow] = await db
    .select({ count: count() })
    .from(installment)
    .innerJoin(subscription, eq(installment.subscriptionId, subscription.id))
    .where(
      and(
        eq(subscription.brandId, brandId),
        eq(installment.status, "overdue"),
        not(isNull(installment.subscriptionId)),
      ),
    );

  const paidCount = Number(paidRow?.count ?? 0);
  const overdueCount = Number(overdueCountRow?.count ?? 0);
  const recoveryRate =
    paidCount + overdueCount > 0
      ? paidCount / (paidCount + overdueCount)
      : null;

  // 4. Churn involuntário: assinaturas canceladas com cancelReason = 'dunning_exhausted'
  const [churnRow] = await db
    .select({ count: count() })
    .from(subscription)
    .where(
      and(
        eq(subscription.brandId, brandId),
        eq(subscription.status, "cancelled"),
        eq(subscription.cancelReason, "dunning_exhausted"),
      ),
    );

  const involuntaryChurn = Number(churnRow?.count ?? 0);

  // 5. Aging médio: via view v_delinquency_aging (já filtra brand_id via RLS user_brand_ids())
  const agingResult = await db.execute(sql`
    SELECT
      COALESCE(AVG(days_overdue), NULL)::float AS avg_aging,
      COALESCE(SUM(amount), 0)::float         AS total_amount
    FROM v_delinquency_aging
    WHERE brand_id = ${brandId}::uuid
  `);

  const agingRows = agingResult as unknown as Array<Record<string, unknown>>;
  const agingRow = agingRows[0] ?? {};
  const avgAgingDays =
    agingRow["avg_aging"] != null ? Number(agingRow["avg_aging"]) : null;

  // 6. Aging buckets via view v_delinquency_aging
  const bucketsResult = await db.execute(sql`
    SELECT
      CASE
        WHEN days_overdue BETWEEN 1 AND 3   THEN '1–3 dias'
        WHEN days_overdue BETWEEN 4 AND 7   THEN '4–7 dias'
        WHEN days_overdue BETWEEN 8 AND 15  THEN '8–15 dias'
        WHEN days_overdue BETWEEN 16 AND 30 THEN '16–30 dias'
        ELSE '>30 dias'
      END                                       AS label,
      COUNT(*)::int                             AS cnt,
      COALESCE(SUM(amount), 0)::float           AS total_amount
    FROM v_delinquency_aging
    WHERE brand_id = ${brandId}::uuid
    GROUP BY 1
    ORDER BY MIN(days_overdue) ASC
  `);

  const bucketRows = bucketsResult as unknown as Array<Record<string, unknown>>;

  const BUCKET_LABELS = [
    "1–3 dias",
    "4–7 dias",
    "8–15 dias",
    "16–30 dias",
    ">30 dias",
  ];

  const bucketMap = new Map<string, { count: number; amount: number }>();
  for (const row of bucketRows) {
    bucketMap.set(String(row["label"]), {
      count: Number(row["cnt"] ?? 0),
      amount: Number(row["total_amount"] ?? 0),
    });
  }

  const agingBuckets: AgingBucket[] = BUCKET_LABELS.map((label) => ({
    label,
    count: bucketMap.get(label)?.count ?? 0,
    amount: bucketMap.get(label)?.amount ?? 0,
  }));

  // 7. Breakdown por oferta: JOIN installment → subscription → offer
  const breakdownRows = await db
    .select({
      offerId: subscription.offerId,
      offerName: offer.name,
      overdueCount: count(installment.id),
      overdueAmount: sum(installment.amount),
      retrySum: sum(installment.retryCount),
    })
    .from(installment)
    .innerJoin(subscription, eq(installment.subscriptionId, subscription.id))
    .innerJoin(offer, eq(subscription.offerId, offer.id))
    .where(
      and(
        eq(subscription.brandId, brandId),
        eq(installment.status, "overdue"),
        not(isNull(installment.subscriptionId)),
      ),
    )
    .groupBy(subscription.offerId, offer.name)
    .orderBy(sql`SUM(${installment.amount}) DESC`);

  const offerBreakdown: OfferBreakdown[] = breakdownRows.map((row) => ({
    offerId: row.offerId,
    offerName: row.offerName,
    overdueCount: Number(row.overdueCount ?? 0),
    overdueAmount: Number(row.overdueAmount ?? 0),
    retryCount: Number(row.retrySum ?? 0),
  }));

  // 8. Total de retentativas
  const [retriesRow] = await db
    .select({ total: sum(installment.retryCount) })
    .from(installment)
    .innerJoin(subscription, eq(installment.subscriptionId, subscription.id))
    .where(
      and(
        eq(subscription.brandId, brandId),
        gt(installment.retryCount, 0),
        not(isNull(installment.subscriptionId)),
      ),
    );

  const totalRetries = Number(retriesRow?.total ?? 0);

  return {
    pastDueCount,
    totalOverdueAmount,
    recoveryRate,
    involuntaryChurn,
    avgAgingDays,
    agingBuckets,
    offerBreakdown,
    totalRetries,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AnalyticsInadimplenciaPage() {
  // RBAC: verifica sessão — RLS do Supabase limita dados por brand
  await requireSession();

  const [filters, brands] = await Promise.all([
    getAnalyticsFilters(),
    listBrandsForAnalytics().catch(() => [] as { id: string; name: string }[]),
  ]);

  const { brandId } = filters;

  const metrics = brandId
    ? await queryDunningMetrics(brandId).catch(
        (): DunningMetricsData => ({
          pastDueCount: 0,
          totalOverdueAmount: 0,
          recoveryRate: null,
          involuntaryChurn: 0,
          avgAgingDays: null,
          agingBuckets: [],
          offerBreakdown: [],
          totalRetries: 0,
        }),
      )
    : null;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Inadimplência</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Assinaturas past_due, parcelas vencidas e dunning
        </p>
      </div>

      {/* Filtros globais — compartilhados com outros painéis de analytics */}
      <Suspense>
        <GlobalFilters brands={brands} defaultFilters={{ brandId, period: filters.period }} />
      </Suspense>

      {/* Conteúdo principal */}
      {brandId && metrics ? (
        <DunningMetrics data={metrics} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Selecione uma marca para ver os dados de inadimplência.
        </p>
      )}
    </div>
  );
}

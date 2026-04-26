/**
 * /analytics/overview — Visão geral de KPIs consolidados por marca e período.
 * Server Component.
 * T-10-08: docs/20-domain/14-analytics.md
 * T-12-27: filtros globais persistidos em cookie (docs/80-roadmap/09-sprint-12-ui-gaps.md)
 */

import { Suspense } from "react";
import { GlobalFilters } from "@/components/analytics/global-filters";
import { OverviewCards } from "@/components/analytics/overview-cards";
import { AnalyticsSkeleton } from "@/components/analytics/analytics-skeleton";
import { queryOverviewKpis } from "@/lib/analytics";
import { db } from "@/lib/db/client";
import {
  getAnalyticsFilters,
  listBrandsForAnalytics,
} from "@/app/(app)/analytics/actions";

export const metadata = {
  title: "Visão Geral — Analytics — CNE-OS",
};

/** Converte period string em datas from/to. */
function periodToDates(period: string): { from: Date; to: Date } {
  const to = new Date();
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

export default async function AnalyticsOverviewPage() {
  const [filters, brands] = await Promise.all([
    getAnalyticsFilters(),
    listBrandsForAnalytics().catch(() => [] as { id: string; name: string }[]),
  ]);

  const { brandId, period } = filters;
  const { from, to } = periodToDates(period);

  // brandId=null → consolidar TODAS as marcas (filtro "Todas as marcas")
  const kpis = await queryOverviewKpis({ brandId, from, to }, db).catch(() => null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Visão Geral</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Métricas consolidadas por marca e período
        </p>
      </div>

      <Suspense>
        <GlobalFilters brands={brands} defaultFilters={{ brandId, period }} />
      </Suspense>

      <Suspense fallback={<AnalyticsSkeleton metricCount={5} showChart={false} />}>
        {kpis ? (
          <OverviewCards kpis={kpis} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 text-muted-foreground mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
              />
            </svg>
            <p className="font-medium text-foreground">Sem dados no período</p>
            <p className="text-sm text-muted-foreground mt-1">
              {brandId
                ? 'Nenhuma métrica encontrada para a marca e período selecionados.'
                : 'Nenhuma métrica encontrada para o período selecionado.'}
            </p>
          </div>
        )}
      </Suspense>
    </div>
  );
}

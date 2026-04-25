/**
 * /analytics/overview — Visão geral de KPIs consolidados por marca e período.
 * Server Component.
 * T-10-08: docs/20-domain/14-analytics.md
 */

import { Suspense } from "react";
import { GlobalFilters } from "@/components/analytics/global-filters";
import { OverviewCards } from "@/components/analytics/overview-cards";
import { queryOverviewKpis } from "@/lib/analytics";
import { db } from "@/lib/db/client";

export const metadata = {
  title: "Visão Geral — Analytics — CNE-OS",
};

type Props = { searchParams: Promise<Record<string, string>> };

export default async function AnalyticsOverviewPage({ searchParams }: Props) {
  const params = await searchParams;
  const brandId = params["brandId"] ?? "";
  const from = params["from"]
    ? new Date(params["from"])
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = params["to"] ? new Date(params["to"]) : new Date();

  // Se não há brandId selecionado, mostrar estado vazio
  const kpis = brandId
    ? await queryOverviewKpis({ brandId, from, to }, db).catch(() => null)
    : null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Visão Geral</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Métricas consolidadas por marca e período
        </p>
      </div>

      <Suspense>
        {/* brands será populado por Server Action futura (T-10-09) */}
        <GlobalFilters brands={[]} />
      </Suspense>

      {kpis ? (
        <OverviewCards kpis={kpis} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Selecione uma marca para ver os dados.
        </p>
      )}
    </div>
  );
}

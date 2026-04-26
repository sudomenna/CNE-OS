/**
 * /analytics/funis — Conversão e cycle time por estágio.
 * T-12-27: filtros globais persistidos em cookie.
 * T-12-29: botão "Exportar CSV" + drill-down.
 */

import { Suspense } from "react";
import { GlobalFilters } from "@/components/analytics/global-filters";
import { FunnelConversionChart } from "@/components/analytics/funnel-conversion";
import { ExportButton } from "@/components/analytics/export-button";
import { queryFunnelConversion } from "@/lib/analytics";
import {
  getAnalyticsFilters,
  listBrandsForAnalytics,
} from "@/app/(app)/analytics/actions";

function periodToDates(period: string): { from: Date; to: Date } {
  const to = new Date();
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

export default async function AnalyticsFunnelsPage() {
  const [filters, brands] = await Promise.all([
    getAnalyticsFilters(),
    listBrandsForAnalytics().catch(() => [] as { id: string; name: string }[]),
  ]);

  const { brandId, period } = filters;
  const { from, to } = periodToDates(period);

  const data = brandId
    ? await queryFunnelConversion({ brandId, from, to }).catch(() => [])
    : [];

  const exportHref = brandId
    ? `/analytics/funnels/export?brandId=${brandId}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`
    : "#";

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Funis</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Conversão e cycle time por estágio
          </p>
        </div>
        {brandId && <ExportButton href={exportHref} />}
      </div>
      <Suspense>
        <GlobalFilters brands={brands} defaultFilters={{ brandId, period }} />
      </Suspense>
      {brandId ? (
        <FunnelConversionChart data={data} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Selecione uma marca para ver os dados.
        </p>
      )}
    </div>
  );
}

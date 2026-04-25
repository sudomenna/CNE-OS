import { Suspense } from "react";
import { GlobalFilters } from "@/components/analytics/global-filters";
import { SalesCharts } from "@/components/analytics/sales-charts";
import { querySalesByDay, queryRefundsByDay } from "@/lib/analytics";

type Props = { searchParams: Promise<Record<string, string>> };

export default async function AnalyticsSalesPage({ searchParams }: Props) {
  const params = await searchParams;
  const brandId = params.brandId ?? "";
  const from = params.from
    ? new Date(params.from)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = params.to ? new Date(params.to) : new Date();

  const [sales, refunds] = brandId
    ? await Promise.all([
        querySalesByDay({ brandId, from, to }).catch(() => []),
        queryRefundsByDay({ brandId, from, to }).catch(() => []),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Receita e transações por período
          </p>
        </div>
        {brandId && (
          <a
            href={`/analytics/sales/export?brandId=${brandId}&from=${params.from ?? ""}&to=${params.to ?? ""}`}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Exportar CSV
          </a>
        )}
      </div>

      <Suspense>
        <GlobalFilters brands={[]} />
      </Suspense>

      {brandId ? (
        <SalesCharts sales={sales} refunds={refunds} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Selecione uma marca para ver os dados.
        </p>
      )}
    </div>
  );
}

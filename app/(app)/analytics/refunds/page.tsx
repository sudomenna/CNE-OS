import { Suspense } from "react";
import { GlobalFilters } from "@/components/analytics/global-filters";
import { RefundReasons } from "@/components/analytics/refund-reasons";
import { queryRefundsByDay, queryDelinquency, querySalesByDay } from "@/lib/analytics";

type Props = { searchParams: Promise<Record<string, string>> };

export default async function AnalyticsRefundsPage({ searchParams }: Props) {
  const params = await searchParams;
  const brandId = params.brandId ?? "";
  const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = params.to ? new Date(params.to) : new Date();

  const [refunds, delinquency, sales] = brandId
    ? await Promise.all([
        queryRefundsByDay({ brandId, from, to }).catch(() => []),
        queryDelinquency({ brandId, from, to }).catch(() => []),
        querySalesByDay({ brandId, from, to }).catch(() => []),
      ])
    : [[], [], []];

  const totalSales = sales.reduce((acc, r) => acc + r.transactionsCount, 0);
  const totalRefunds = refunds.reduce((acc, r) => acc + r.refundsCount, 0);
  const refundRate = totalSales > 0 ? totalRefunds / totalSales : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Reembolsos</h1>
        <p className="text-muted-foreground text-sm mt-1">Taxa de reembolso e inadimplência</p>
      </div>
      <Suspense>
        <GlobalFilters brands={[]} />
      </Suspense>
      {brandId ? (
        <RefundReasons
          refunds={refunds}
          delinquency={delinquency}
          refundRate={refundRate}
          totalRefunds={totalRefunds}
        />
      ) : (
        <p className="text-muted-foreground text-sm">Selecione uma marca para ver os dados.</p>
      )}
    </div>
  );
}

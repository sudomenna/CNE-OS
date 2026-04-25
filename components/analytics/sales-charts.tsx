import type { SalesByDayRow, RefundByDayRow } from "@/lib/analytics/types";

type Props = {
  sales: SalesByDayRow[];
  refunds: RefundByDayRow[];
};

export function SalesCharts({ sales, refunds }: Props) {
  const totalRevenue = sales.reduce((acc, r) => acc + r.grossRevenue, 0);
  const totalTransactions = sales.reduce((acc, r) => acc + r.transactionsCount, 0);
  const totalRefunded = refunds.reduce((acc, r) => acc + r.refundedAmount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Receita Total</p>
          <p className="mt-1 text-xl font-bold">
            R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Transações</p>
          <p className="mt-1 text-xl font-bold">{totalTransactions}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Reembolsado</p>
          <p className="mt-1 text-xl font-bold">
            R$ {totalRefunded.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Data</th>
              <th className="px-4 py-3 text-left font-medium">Oferta</th>
              <th className="px-4 py-3 text-right font-medium">Transações</th>
              <th className="px-4 py-3 text-right font-medium">Receita</th>
              <th className="px-4 py-3 text-right font-medium">Ticket Médio</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum dado no período.
                </td>
              </tr>
            ) : (
              sales.map((row, i) => (
                <tr key={i} className="border-t hover:bg-muted/25">
                  <td className="px-4 py-3">{row.day}</td>
                  <td className="px-4 py-3">{row.offerName}</td>
                  <td className="px-4 py-3 text-right">{row.transactionsCount}</td>
                  <td className="px-4 py-3 text-right">
                    R$ {row.grossRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    R$ {row.avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

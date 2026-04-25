import type { RefundByDayRow, DelinquencyRow } from "@/lib/analytics/types";

type Props = {
  refunds: RefundByDayRow[];
  delinquency: DelinquencyRow[];
  refundRate: number;
  totalRefunds: number;
};

export function RefundReasons({ refunds, delinquency, refundRate, totalRefunds }: Props) {
  const totalRefunded = refunds.reduce((acc, r) => acc + r.refundedAmount, 0);
  const totalOverdueDays = delinquency.reduce((acc, r) => acc + r.daysOverdue, 0);
  const avgOverdueDays = delinquency.length > 0 ? totalOverdueDays / delinquency.length : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Taxa de Reembolso</p>
          <p className="mt-1 text-xl font-bold">{(refundRate * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Reembolsos</p>
          <p className="mt-1 text-xl font-bold">{totalRefunds}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Valor Reembolsado</p>
          <p className="mt-1 text-xl font-bold">R$ {totalRefunded.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Parcelas Inadimplentes</p>
          <p className="mt-1 text-xl font-bold text-destructive">{delinquency.length}</p>
        </div>
      </div>

      {/* Refunds by offer */}
      {refunds.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Reembolsos por Oferta</h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Data</th>
                  <th className="px-4 py-3 text-right font-medium">Quantidade</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-muted/25">
                    <td className="px-4 py-3">{row.day}</td>
                    <td className="px-4 py-3 text-right">{row.refundsCount}</td>
                    <td className="px-4 py-3 text-right">R$ {row.refundedAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delinquency */}
      {delinquency.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">
            Inadimplência ({delinquency.length} parcelas — média {avgOverdueDays.toFixed(0)} dias em atraso)
          </h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Vencimento</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 text-right font-medium">Dias em Atraso</th>
                </tr>
              </thead>
              <tbody>
                {delinquency.slice(0, 50).map((row) => (
                  <tr key={row.id} className="border-t hover:bg-muted/25">
                    <td className="px-4 py-3">{row.dueAt}</td>
                    <td className="px-4 py-3 text-right">R$ {row.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right text-destructive font-medium">{row.daysOverdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

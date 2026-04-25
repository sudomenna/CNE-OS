import type { InboxDailyRow } from "@/lib/analytics/types";

type Props = { data: InboxDailyRow[] };

export function InboxHeatmap({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>;
  }

  const totalConversations = data.reduce((acc, r) => acc + r.conversationsCount, 0);
  const rowsWithResponse = data.filter((r) => r.avgResponseTimeMinutes != null);
  const avgResponseTime =
    rowsWithResponse.length > 0
      ? rowsWithResponse.reduce((acc, r) => acc + (r.avgResponseTimeMinutes ?? 0), 0) /
        rowsWithResponse.length
      : null;
  const totalOverdue = data.reduce((acc, r) => acc + r.overdueCount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total de Conversas</p>
          <p className="mt-1 text-xl font-bold">{totalConversations}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tempo Médio de Resposta</p>
          <p className="mt-1 text-xl font-bold">
            {avgResponseTime != null ? `${avgResponseTime.toFixed(0)} min` : "—"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Conversas em Atraso</p>
          <p className="mt-1 text-xl font-bold text-destructive">{totalOverdue}</p>
        </div>
      </div>

      {/* Daily table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Data</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Abertas</th>
              <th className="px-4 py-3 text-right font-medium">Fechadas</th>
              <th className="px-4 py-3 text-right font-medium">Tempo Resp. (min)</th>
              <th className="px-4 py-3 text-right font-medium">Em Atraso</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-t hover:bg-muted/25">
                <td className="px-4 py-3">{row.day}</td>
                <td className="px-4 py-3 text-right">{row.conversationsCount}</td>
                <td className="px-4 py-3 text-right">{row.openCount}</td>
                <td className="px-4 py-3 text-right">{row.closedCount}</td>
                <td className="px-4 py-3 text-right">
                  {row.avgResponseTimeMinutes != null
                    ? row.avgResponseTimeMinutes.toFixed(0)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={row.overdueCount > 0 ? "text-destructive font-medium" : ""}
                  >
                    {row.overdueCount}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

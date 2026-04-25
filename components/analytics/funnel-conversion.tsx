import type { FunnelConversionRow } from "@/lib/analytics/types";

type Props = { data: FunnelConversionRow[] };

function groupByFunnel(data: FunnelConversionRow[]) {
  const map = new Map<
    string,
    {
      funnelId: string;
      funnelName: string;
      labels: Record<string, number>;
      avgCycleTimeDays: number | null;
      totalEntries: number;
    }
  >();

  for (const row of data) {
    if (!map.has(row.funnelId)) {
      map.set(row.funnelId, {
        funnelId: row.funnelId,
        funnelName: row.funnelName,
        labels: {},
        avgCycleTimeDays: row.avgCycleTimeDays,
        totalEntries: 0,
      });
    }
    const entry = map.get(row.funnelId)!;
    entry.labels[row.label] = (entry.labels[row.label] ?? 0) + row.entriesCount;
    entry.totalEntries += row.entriesCount;
    if (row.avgCycleTimeDays != null) entry.avgCycleTimeDays = row.avgCycleTimeDays;
  }

  return Array.from(map.values());
}

export function FunnelConversionChart({ data }: Props) {
  const funnels = groupByFunnel(data);

  if (funnels.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {funnels.map((funnel) => (
        <div key={funnel.funnelId} className="rounded-lg border p-4">
          <h2 className="font-semibold mb-3">{funnel.funnelName}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
            <div className="rounded border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Total Entradas</p>
              <p className="text-lg font-bold">{funnel.totalEntries}</p>
            </div>
            <div className="rounded border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Ganhos (won)</p>
              <p className="text-lg font-bold">{funnel.labels["won"] ?? 0}</p>
            </div>
            <div className="rounded border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Perdidos (lost)</p>
              <p className="text-lg font-bold">{funnel.labels["lost"] ?? 0}</p>
            </div>
            <div className="rounded border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Cycle Time Médio</p>
              <p className="text-lg font-bold">
                {funnel.avgCycleTimeDays != null
                  ? `${funnel.avgCycleTimeDays.toFixed(1)}d`
                  : "—"}
              </p>
            </div>
          </div>
          {/* Label breakdown */}
          <div className="text-sm">
            {Object.entries(funnel.labels).map(([label, count]) => (
              <div
                key={label}
                className="flex items-center justify-between border-t py-2"
              >
                <span className="capitalize text-muted-foreground">{label}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

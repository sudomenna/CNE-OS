import type { CampaignAttributionRow } from "@/lib/analytics/types";

type Props = { data: CampaignAttributionRow[] };

export function CampaignRoi({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma campanha com dados no período.
      </p>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Campanha</th>
            <th className="px-4 py-3 text-right font-medium">Entradas</th>
            <th className="px-4 py-3 text-right font-medium">Conversões</th>
            <th className="px-4 py-3 text-right font-medium">
              Taxa de Conversão
            </th>
            <th className="px-4 py-3 text-right font-medium">
              Custo/Conversão
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.campaignId} className="border-t hover:bg-muted/25">
              <td className="px-4 py-3 font-medium">{row.campaignName}</td>
              <td className="px-4 py-3 text-right">{row.entriesCount}</td>
              <td className="px-4 py-3 text-right">{row.conversionsCount}</td>
              <td className="px-4 py-3 text-right">
                {row.conversionRate != null
                  ? `${(row.conversionRate * 100).toFixed(1)}%`
                  : "—"}
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                {/* OQ-SPRINT10-02: custo de campanha não está na Fase 1 */}
                Fase 2
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

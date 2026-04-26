"use client";

/**
 * HeatmapChart — volume de mensagens inbound por hora × dia da semana.
 * T-12-28: /analytics/atendimento
 *
 * Recharts não tem heatmap nativo. Implementado como tabela HTML estilizada
 * com intensidade de cor proporcional ao valor máximo da célula.
 */

export interface HeatmapChartProps {
  data: { hour: number; dow: number; count: number }[];
}

const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DOWS = [0, 1, 2, 3, 4, 5, 6];

function buildMatrix(
  data: HeatmapChartProps["data"],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of data) {
    map[`${row.dow}-${row.hour}`] = row.count;
  }
  return map;
}

function getColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "bg-muted/20";
  const ratio = value / max;
  if (ratio < 0.2) return "bg-blue-100 dark:bg-blue-950";
  if (ratio < 0.4) return "bg-blue-200 dark:bg-blue-800";
  if (ratio < 0.6) return "bg-blue-400 dark:bg-blue-600";
  if (ratio < 0.8) return "bg-blue-600 dark:bg-blue-400";
  return "bg-blue-800 dark:bg-blue-200";
}

export function HeatmapChart({ data }: HeatmapChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Sem dados no período selecionado.
      </p>
    );
  }

  const matrix = buildMatrix(data);
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div
      role="table"
      aria-label="Heatmap de volume de mensagens por hora e dia da semana"
      className="overflow-x-auto"
    >
      <div className="min-w-[680px]">
        {/* Header: horas */}
        <div
          role="row"
          className="flex items-center gap-px mb-px"
        >
          {/* corner */}
          <div className="w-10 shrink-0" aria-hidden="true" />
          {HOURS.map((h) => (
            <div
              key={h}
              role="columnheader"
              className="flex-1 text-center text-[10px] text-muted-foreground leading-none py-1"
            >
              {h % 3 === 0 ? `${String(h).padStart(2, "0")}h` : ""}
            </div>
          ))}
        </div>

        {/* Rows: dias da semana */}
        {DOWS.map((dow) => (
          <div key={dow} role="row" className="flex items-center gap-px mb-px">
            <div
              role="rowheader"
              className="w-10 shrink-0 text-xs text-muted-foreground text-right pr-2 leading-none"
            >
              {DOW_LABELS[dow]}
            </div>
            {HOURS.map((hour) => {
              const value = matrix[`${dow}-${hour}`] ?? 0;
              return (
                <div
                  key={hour}
                  role="cell"
                  aria-label={`${DOW_LABELS[dow]} ${String(hour).padStart(2, "0")}h: ${value} mensagens`}
                  title={`${DOW_LABELS[dow]} ${String(hour).padStart(2, "0")}h: ${value} mensagem${value !== 1 ? "s" : ""}`}
                  className={`flex-1 aspect-square rounded-sm transition-colors ${getColor(value, max)}`}
                />
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-xs text-muted-foreground">Menos</span>
          {["bg-muted/20", "bg-blue-100", "bg-blue-300", "bg-blue-500", "bg-blue-700"].map(
            (cls) => (
              <div key={cls} className={`w-4 h-4 rounded-sm ${cls}`} aria-hidden="true" />
            ),
          )}
          <span className="text-xs text-muted-foreground">Mais</span>
        </div>
      </div>
    </div>
  );
}

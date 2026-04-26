/**
 * MetricCard — card de métrica reutilizável para dashboards de analytics.
 * T-12-29: adiciona prop onDrillDown opcional para drill-down.
 * docs/70-ux/08-screen-dashboards.md §1.1
 */

import { cn } from "@/lib/utils";

export type MetricCardProps = {
  /** Título discreto do card */
  label: string;
  /** Valor principal em destaque */
  value: string;
  /** Subtítulo complementar (quantidade, unidade) */
  sublabel?: string;
  /** Variação vs período comparado — positivo (verde), negativo (vermelho), neutro */
  change?: number;
  /** Quando presente, o card inteiro se torna clicável */
  onDrillDown?: () => void;
};

function ChangeIndicator({ change }: { change: number }) {
  const isPositive = change > 0;
  const isNeutral = change === 0;
  return (
    <span
      className={cn(
        "text-xs font-medium",
        isNeutral && "text-muted-foreground",
        isPositive && "text-green-600 dark:text-green-400",
        !isPositive && !isNeutral && "text-red-600 dark:text-red-400",
      )}
      aria-label={`Variação: ${isPositive ? "+" : ""}${change.toFixed(1)}%`}
    >
      {isPositive ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

export function MetricCard({
  label,
  value,
  sublabel,
  change,
  onDrillDown,
}: MetricCardProps) {
  const isClickable = typeof onDrillDown === "function";

  const inner = (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="text-2xl font-bold">{value}</p>
        {change !== undefined && <ChangeIndicator change={change} />}
      </div>
      {sublabel && (
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      )}
      {isClickable && (
        <p className="mt-2 text-xs text-primary font-medium">Ver detalhe →</p>
      )}
    </div>
  );

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onDrillDown}
        className={cn(
          "block w-full text-left cursor-pointer",
          "rounded-lg ring-offset-background",
          "hover:ring-2 hover:ring-ring hover:ring-offset-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "transition-shadow",
        )}
        aria-label={`Ver detalhe de ${label}`}
      >
        {inner}
      </button>
    );
  }

  return inner;
}

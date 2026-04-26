/**
 * SlaCard — primeira resposta: % de conversas respondidas em ≤ 15 min.
 * T-12-28: /analytics/atendimento
 *
 * Server Component — sem interatividade.
 */

import { Progress } from "@/components/ui/progress";

export interface SlaCardProps {
  /** Percentual 0–100 de conversas respondidas dentro do SLA (≤ 15 min). */
  pct: number;
  /** Número absoluto de conversas dentro do SLA. */
  withinSla: number;
  /** Total de conversas avaliadas no período. */
  total: number;
}

function colorClass(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-destructive";
}

function progressColor(pct: number): string {
  if (pct >= 80) return "[&>div]:bg-emerald-500";
  if (pct >= 60) return "[&>div]:bg-yellow-500";
  return "[&>div]:bg-destructive";
}

export function SlaCard({ pct, withinSla, total }: SlaCardProps) {
  const displayPct = Math.round(pct);

  return (
    <div
      className="rounded-lg border bg-card p-5 flex flex-col gap-3"
      aria-label={`SLA de primeira resposta: ${displayPct}% dentro do alvo`}
    >
      <p className="text-sm text-muted-foreground font-medium">
        SLA — primeira resposta ≤ 15 min
      </p>

      <p
        className={`text-4xl font-bold tabular-nums leading-none ${colorClass(pct)}`}
        aria-hidden="true"
      >
        {displayPct}%
      </p>

      <Progress
        value={displayPct}
        className={`h-2 ${progressColor(pct)}`}
        aria-label={`${displayPct}% dentro do SLA`}
      />

      <p className="text-xs text-muted-foreground">
        {withinSla.toLocaleString("pt-BR")} de{" "}
        {total.toLocaleString("pt-BR")} conversas respondidas em ≤ 15 min
      </p>
    </div>
  );
}

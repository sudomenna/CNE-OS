/**
 * DunningMetrics — componente de analytics de inadimplência (T-13-18)
 * docs/70-ux/08-screen-dashboards.md §3
 *
 * Recebe dados pre-calculados do Server Component pai (page.tsx).
 * Renderiza: 5 KPI cards + aging buckets + breakdown por oferta.
 * Client Component apenas para interatividade futura — por ora, tudo é display.
 */

"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard } from "@/components/analytics/metric-card";

// ---------------------------------------------------------------------------
// Types exportadas para uso em page.tsx
// ---------------------------------------------------------------------------

export type AgingBucket = {
  label: string;
  count: number;
  amount: number;
};

export type OfferBreakdown = {
  offerId: string;
  offerName: string;
  overdueCount: number;
  overdueAmount: number;
  retryCount: number;
};

export type DunningMetricsData = {
  /** count subscription.status='past_due' */
  pastDueCount: number;
  /** Σ installment.amount WHERE status='overdue' (em reais) */
  totalOverdueAmount: number;
  /** paid after overdue / total overdue — como decimal 0..1 */
  recoveryRate: number | null;
  /** count subscriptions cancelled com reason dunning_exhausted */
  involuntaryChurn: number;
  /** média de dias em atraso nas parcelas overdue */
  avgAgingDays: number | null;
  /** buckets de aging: 1-3d, 4-7d, 8-15d, 16-30d, >30d */
  agingBuckets: AgingBucket[];
  /** breakdown por oferta */
  offerBreakdown: OfferBreakdown[];
  /** total de retentativas registradas */
  totalRetries: number;
};

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents);
}

function formatPct(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function formatDays(days: number | null): string {
  if (days === null) return "—";
  return `${days.toFixed(1)} dias`;
}

// ---------------------------------------------------------------------------
// AgingBucketsTable
// ---------------------------------------------------------------------------

function AgingBucketsTable({ buckets }: { buckets: AgingBucket[] }) {
  if (buckets.every((b) => b.count === 0)) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma parcela em atraso no período.
      </p>
    );
  }

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Faixa de atraso</TableHead>
          <TableHead className="text-right">Parcelas</TableHead>
          <TableHead className="text-right">Valor em aberto</TableHead>
          <TableHead className="w-40">Distribuição</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {buckets.map((bucket) => (
          <TableRow key={bucket.label}>
            <TableCell className="font-medium">{bucket.label}</TableCell>
            <TableCell className="text-right">{bucket.count}</TableCell>
            <TableCell className="text-right">
              {formatBRL(bucket.amount)}
            </TableCell>
            <TableCell>
              <div
                className="h-2 rounded bg-destructive/70"
                style={{
                  width: `${Math.round((bucket.count / maxCount) * 100)}%`,
                  minWidth: bucket.count > 0 ? "4px" : "0",
                }}
                role="img"
                aria-label={`${bucket.count} parcelas`}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// OfferBreakdownTable
// ---------------------------------------------------------------------------

function OfferBreakdownTable({ rows }: { rows: OfferBreakdown[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum dado de breakdown disponível.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Oferta</TableHead>
          <TableHead className="text-right">Parcelas vencidas</TableHead>
          <TableHead className="text-right">Valor em aberto</TableHead>
          <TableHead className="text-right">Retentativas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.offerId}>
            <TableCell className="font-medium">{row.offerName}</TableCell>
            <TableCell className="text-right">{row.overdueCount}</TableCell>
            <TableCell className="text-right">
              {formatBRL(row.overdueAmount)}
            </TableCell>
            <TableCell className="text-right">{row.retryCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// DunningMetrics — componente principal exportado
// ---------------------------------------------------------------------------

export function DunningMetrics({ data }: { data: DunningMetricsData }) {
  return (
    <div className="flex flex-col gap-8">
      {/* KPI Cards — docs/70-ux/08-screen-dashboards.md §3.1 */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">
          Indicadores de inadimplência
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard
            label="Assinaturas past_due"
            value={String(data.pastDueCount)}
            sublabel="status = past_due"
          />
          <MetricCard
            label="Valor em aberto"
            value={formatBRL(data.totalOverdueAmount)}
            sublabel="parcelas overdue"
          />
          <MetricCard
            label="Taxa de recuperação"
            value={formatPct(data.recoveryRate)}
            sublabel="pago após vencimento"
          />
          <MetricCard
            label="Churn involuntário"
            value={String(data.involuntaryChurn)}
            sublabel="dunning_exhausted"
          />
          <MetricCard
            label="Aging médio em atraso"
            value={formatDays(data.avgAgingDays)}
            sublabel="dias desde vencimento"
          />
        </div>
      </section>

      {/* Aging Buckets — docs/70-ux/08-screen-dashboards.md §3.2 */}
      <section
        aria-labelledby="aging-heading"
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <h2
          id="aging-heading"
          className="text-sm font-semibold mb-4"
        >
          Aging buckets (parcelas vencidas por faixa de atraso)
        </h2>
        <AgingBucketsTable buckets={data.agingBuckets} />
      </section>

      {/* Breakdown por oferta — docs/70-ux/08-screen-dashboards.md §3.2 */}
      <section
        aria-labelledby="offer-breakdown-heading"
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <h2
          id="offer-breakdown-heading"
          className="text-sm font-semibold mb-4"
        >
          Inadimplência por oferta
        </h2>
        <OfferBreakdownTable rows={data.offerBreakdown} />
      </section>
    </div>
  );
}

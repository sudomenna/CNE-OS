/**
 * /analytics/atendimento — SLA, heatmap e produtividade do inbox.
 * T-12-28: docs/80-roadmap/09-sprint-12-ui-gaps.md
 *
 * Server Component — lê dados diretamente do domínio analítico.
 * RBAC: admin, suporte (docs/70-ux/08-screen-dashboards.md §8)
 */

import { Suspense } from "react";
import { GlobalFilters } from "@/components/analytics/global-filters";
import { HeatmapChart } from "@/components/analytics/heatmap-chart";
import { SlaCard } from "@/components/analytics/sla-card";
import {
  getAnalyticsFilters,
  listBrandsForAnalytics,
} from "@/app/(app)/analytics/actions";
import {
  queryConversationHeatmap,
  queryConversationSla,
  queryConversationAvgResolution,
  queryTopAttendants,
} from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function periodToDates(period: string): { from: Date; to: Date } {
  const to = new Date();
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AnalyticsAtendimentoPage() {
  const [filters, brands] = await Promise.all([
    getAnalyticsFilters(),
    listBrandsForAnalytics().catch(() => [] as { id: string; name: string }[]),
  ]);

  const { brandId, period } = filters;
  const { from, to } = periodToDates(period);

  // Só executa queries se uma marca estiver selecionada
  const [heatmapData, slaData, resolutionData, topAttendants] = brandId
    ? await Promise.all([
        queryConversationHeatmap({ brandId, from, to }).catch(() => []),
        queryConversationSla({ brandId, from, to }).catch(() => ({
          total: 0,
          withinSla: 0,
          pct: 0,
        })),
        queryConversationAvgResolution({ brandId, from, to }).catch(() => ({
          avgMinutes: null,
        })),
        queryTopAttendants({ brandId, from, to }).catch(() => []),
      ])
    : [
        [] as Awaited<ReturnType<typeof queryConversationHeatmap>>,
        { total: 0, withinSla: 0, pct: 0 } as Awaited<
          ReturnType<typeof queryConversationSla>
        >,
        { avgMinutes: null } as Awaited<
          ReturnType<typeof queryConversationAvgResolution>
        >,
        [] as Awaited<ReturnType<typeof queryTopAttendants>>,
      ];

  const isEmpty = !brandId;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Atendimento</h1>
        <p className="text-muted-foreground text-sm mt-1">
          SLA, volume e produtividade do inbox
        </p>
      </div>

      {/* Filtros globais */}
      <Suspense>
        <GlobalFilters brands={brands} defaultFilters={{ brandId, period }} />
      </Suspense>

      {isEmpty ? (
        <p className="text-muted-foreground text-sm">
          Selecione uma marca para visualizar os dados de atendimento.
        </p>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* SLA */}
            <SlaCard
              pct={slaData.pct}
              withinSla={slaData.withinSla}
              total={slaData.total}
            />

            {/* Tempo médio de resolução */}
            <div className="rounded-lg border bg-card p-5 flex flex-col gap-2">
              <p className="text-sm text-muted-foreground font-medium">
                Tempo médio de resolução
              </p>
              <p className="text-4xl font-bold tabular-nums leading-none">
                {formatMinutes(resolutionData.avgMinutes)}
              </p>
              <p className="text-xs text-muted-foreground">
                Média da abertura ao fechamento da conversa
              </p>
            </div>

            {/* Total de conversas (derivado do heatmap) */}
            <div className="rounded-lg border bg-card p-5 flex flex-col gap-2">
              <p className="text-sm text-muted-foreground font-medium">
                Mensagens recebidas
              </p>
              <p className="text-4xl font-bold tabular-nums leading-none">
                {heatmapData
                  .reduce((acc, r) => acc + r.count, 0)
                  .toLocaleString("pt-BR")}
              </p>
              <p className="text-xs text-muted-foreground">
                Total de mensagens inbound no período
              </p>
            </div>
          </div>

          {/* Heatmap */}
          <section aria-labelledby="heatmap-title">
            <div className="rounded-lg border bg-card p-5 flex flex-col gap-4">
              <div>
                <h2
                  id="heatmap-title"
                  className="text-sm font-semibold"
                >
                  Volume de mensagens por hora e dia da semana
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Mensagens inbound — horário de Brasília
                </p>
              </div>
              <HeatmapChart data={heatmapData} />
            </div>
          </section>

          {/* Top atendentes */}
          <section aria-labelledby="attendants-title">
            <div className="rounded-lg border bg-card p-5 flex flex-col gap-4">
              <h2
                id="attendants-title"
                className="text-sm font-semibold"
              >
                Top atendentes
              </h2>

              {topAttendants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem dados de atribuição no período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th
                          scope="col"
                          className="py-2 text-left font-medium text-muted-foreground"
                        >
                          Atendente
                        </th>
                        <th
                          scope="col"
                          className="py-2 text-right font-medium text-muted-foreground"
                        >
                          Conversas
                        </th>
                        <th
                          scope="col"
                          className="py-2 text-right font-medium text-muted-foreground sr-only"
                        >
                          Proporção
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topAttendants.map((row, i) => {
                        const maxCount =
                          topAttendants[0]?.conversationsCount ?? 1;
                        const barPct = Math.round(
                          (row.conversationsCount / maxCount) * 100,
                        );
                        return (
                          <tr key={row.userId} className="border-b last:border-0">
                            <td className="py-3">
                              <span className="mr-2 text-muted-foreground tabular-nums">
                                {i + 1}.
                              </span>
                              {row.userName}
                            </td>
                            <td className="py-3 text-right tabular-nums font-medium">
                              {row.conversationsCount.toLocaleString("pt-BR")}
                            </td>
                            <td className="py-3 pl-4 w-32">
                              <div
                                className="h-2 rounded-full bg-primary/20"
                                aria-hidden="true"
                              >
                                <div
                                  className="h-2 rounded-full bg-primary transition-all"
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

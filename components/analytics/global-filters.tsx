"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveAnalyticsFiltersAction } from "@/app/(app)/analytics/actions";
import type { AnalyticsPeriod } from "@/app/(app)/analytics/actions";

export type GlobalFiltersProps = {
  brands?: Array<{ id: string; name: string }>;
  defaultFilters?: { brandId: string | null; period: string };
  funnels?: Array<{ id: string; name: string }>;
  campaigns?: Array<{ id: string; name: string }>;
};

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
};

export function GlobalFilters({
  brands = [],
  defaultFilters = { brandId: null, period: "30d" },
  funnels,
  campaigns,
}: GlobalFiltersProps) {
  const router = useRouter();

  const handleChange = useCallback(
    async (updates: { brandId?: string | null; period?: string }) => {
      const next = {
        brandId: updates.brandId !== undefined ? updates.brandId : defaultFilters.brandId,
        period: (updates.period !== undefined ? updates.period : defaultFilters.period) as AnalyticsPeriod,
      };
      await saveAnalyticsFiltersAction(next);
      router.refresh();
    },
    [defaultFilters, router],
  );

  const currentBrandId = defaultFilters.brandId ?? "";
  const currentPeriod = (defaultFilters.period as AnalyticsPeriod) ?? "30d";

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Brand */}
      <div className="flex flex-col gap-1">
        <Label
          htmlFor="filter-brand"
          className="text-xs font-medium text-muted-foreground"
        >
          Marca
        </Label>
        <Select
          value={currentBrandId}
          onValueChange={(value) =>
            handleChange({ brandId: value === "" ? null : value })
          }
        >
          <SelectTrigger id="filter-brand" className="h-9 w-40 text-sm">
            <SelectValue placeholder="Todas as marcas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas as marcas</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Period */}
      <div className="flex flex-col gap-1">
        <Label
          htmlFor="filter-period"
          className="text-xs font-medium text-muted-foreground"
        >
          Período
        </Label>
        <Select
          value={currentPeriod}
          onValueChange={(value) => handleChange({ period: value })}
        >
          <SelectTrigger id="filter-period" className="h-9 w-44 text-sm">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as AnalyticsPeriod[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PERIOD_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Funnel (opcional) */}
      {funnels && funnels.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label
            htmlFor="filter-funnel"
            className="text-xs font-medium text-muted-foreground"
          >
            Funil
          </Label>
          <Select>
            <SelectTrigger id="filter-funnel" className="h-9 w-40 text-sm">
              <SelectValue placeholder="Todos os funis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos os funis</SelectItem>
              {funnels.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Campaign (opcional) */}
      {campaigns && campaigns.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label
            htmlFor="filter-campaign"
            className="text-xs font-medium text-muted-foreground"
          >
            Campanha
          </Label>
          <Select>
            <SelectTrigger id="filter-campaign" className="h-9 w-44 text-sm">
              <SelectValue placeholder="Todas as campanhas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas as campanhas</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

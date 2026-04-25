"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAnalyticsFilters } from "@/lib/hooks/use-analytics-filters";

export type GlobalFiltersProps = {
  brands: Array<{ id: string; name: string }>;
  funnels?: Array<{ id: string; name: string }>;
  campaigns?: Array<{ id: string; name: string }>;
};

export function GlobalFilters({ brands, funnels, campaigns }: GlobalFiltersProps) {
  const { filters, setFilters } = useAnalyticsFilters();

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Brand */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-brand" className="text-xs font-medium text-muted-foreground">
          Marca
        </Label>
        <Select
          value={filters.brandId ?? ""}
          onValueChange={(value) =>
            setFilters({ brandId: value === "" ? null : value })
          }
        >
          <SelectTrigger id="filter-brand" className="h-9 w-40 text-sm">
            <SelectValue placeholder="Todas as marcas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas as marcas</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* From */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-from" className="text-xs font-medium text-muted-foreground">
          De
        </Label>
        <input
          id="filter-from"
          type="date"
          value={filters.from ?? ""}
          onChange={(e) =>
            setFilters({ from: e.target.value === "" ? null : e.target.value })
          }
          className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {/* To */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-to" className="text-xs font-medium text-muted-foreground">
          Até
        </Label>
        <input
          id="filter-to"
          type="date"
          value={filters.to ?? ""}
          onChange={(e) =>
            setFilters({ to: e.target.value === "" ? null : e.target.value })
          }
          className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {/* Funnel (opcional) */}
      {funnels && funnels.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-funnel" className="text-xs font-medium text-muted-foreground">
            Funil
          </Label>
          <Select
            value={filters.funnelId ?? ""}
            onValueChange={(value) =>
              setFilters({ funnelId: value === "" ? null : value })
            }
          >
            <SelectTrigger id="filter-funnel" className="h-9 w-40 text-sm">
              <SelectValue placeholder="Todos os funis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos os funis</SelectItem>
              {funnels.map((funnel) => (
                <SelectItem key={funnel.id} value={funnel.id}>
                  {funnel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Campaign (opcional) */}
      {campaigns && campaigns.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-campaign" className="text-xs font-medium text-muted-foreground">
            Campanha
          </Label>
          <Select
            value={filters.campaignId ?? ""}
            onValueChange={(value) =>
              setFilters({ campaignId: value === "" ? null : value })
            }
          >
            <SelectTrigger id="filter-campaign" className="h-9 w-44 text-sm">
              <SelectValue placeholder="Todas as campanhas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas as campanhas</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

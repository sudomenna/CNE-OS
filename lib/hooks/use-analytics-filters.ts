"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import type { Route } from "next";

export type AnalyticsFilterValues = {
  brandId: string | null;
  from: string | null; // ISO date string YYYY-MM-DD
  to: string | null;
  offerId: string | null;
  funnelId: string | null;
  campaignId: string | null;
};

export function useAnalyticsFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: AnalyticsFilterValues = {
    brandId: searchParams.get("brandId"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    offerId: searchParams.get("offerId"),
    funnelId: searchParams.get("funnelId"),
    campaignId: searchParams.get("campaignId"),
  };

  const setFilters = useCallback(
    (updates: Partial<AnalyticsFilterValues>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value == null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      router.push(`${pathname}?${params.toString()}` as Route);
    },
    [searchParams, router, pathname]
  );

  return { filters, setFilters };
}

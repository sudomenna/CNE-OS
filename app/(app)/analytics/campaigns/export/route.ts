/**
 * GET /analytics/campaigns/export — Exporta CSV de atribuição por campanha.
 * T-12-29: docs/80-roadmap/09-sprint-12-ui-gaps.md
 *
 * Colunas: campaign_name, funnel_id, entries_count, conversions_count, conversion_rate
 * RBAC: analytics.read (admin, financial, marketing, support, commercial)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { queryCampaignAttribution } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  // RBAC — lança ActionError('UNAUTHORIZED') se sem permissão
  try {
    const ctx = await requireSession();
    await requirePermission(ctx, "analytics.read", { kind: "global" });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const brandId = searchParams.get("brandId") ?? "";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (!brandId) {
    return NextResponse.json({ error: "brandId required" }, { status: 400 });
  }

  const from = fromParam
    ? new Date(fromParam)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = toParam ? new Date(toParam) : new Date();

  const rows = await queryCampaignAttribution({ brandId, from, to }).catch(
    () => [],
  );

  const dateSlug = new Date().toISOString().slice(0, 10);
  const header =
    "campaign_name,funnel_id,entries_count,conversions_count,conversion_rate\n";
  const body = rows
    .map(
      (r) =>
        `${JSON.stringify(r.campaignName)},${r.funnelId},${r.entriesCount},${r.conversionsCount},${r.conversionRate != null ? (r.conversionRate * 100).toFixed(2) : ""}`,
    )
    .join("\n");

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaigns-${dateSlug}.csv"`,
    },
  });
}

/**
 * GET /analytics/inbox/export — Exporta CSV de volume de inbox por dia.
 * T-12-29: docs/80-roadmap/09-sprint-12-ui-gaps.md
 *
 * Colunas: date, conversations_count, open_count, closed_count, avg_response_time_minutes, overdue_count
 * RBAC: analytics.read (admin, financial, marketing, support, commercial)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { queryInboxDaily } from "@/lib/analytics";

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

  const rows = await queryInboxDaily({ brandId, from, to }).catch(() => []);

  const dateSlug = new Date().toISOString().slice(0, 10);
  const header =
    "date,conversations_count,open_count,closed_count,avg_response_time_minutes,overdue_count\n";
  const body = rows
    .map(
      (r) =>
        `${r.day},${r.conversationsCount},${r.openCount},${r.closedCount},${r.avgResponseTimeMinutes != null ? r.avgResponseTimeMinutes.toFixed(1) : ""},${r.overdueCount}`,
    )
    .join("\n");

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inbox-${dateSlug}.csv"`,
    },
  });
}

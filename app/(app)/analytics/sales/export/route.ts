import { NextRequest, NextResponse } from "next/server";
import { querySalesByDay } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brandId = searchParams.get("brandId") ?? "";
  const from = searchParams.get("from")
    ? new Date(searchParams.get("from")!)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = searchParams.get("to")
    ? new Date(searchParams.get("to")!)
    : new Date();

  if (!brandId) {
    return NextResponse.json({ error: "brandId required" }, { status: 400 });
  }

  const rows = await querySalesByDay({ brandId, from, to }).catch(() => []);

  const header = "data,oferta,transacoes,receita,ticket_medio\n";
  const body = rows
    .map(
      (r) =>
        `${r.day},${r.offerName},${r.transactionsCount},${r.grossRevenue},${r.avgTicket}`,
    )
    .join("\n");

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vendas-${brandId}.csv"`,
    },
  });
}

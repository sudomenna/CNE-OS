import { Suspense } from "react";
import { GlobalFilters } from "@/components/analytics/global-filters";
import { InboxHeatmap } from "@/components/analytics/inbox-heatmap";
import { queryInboxDaily } from "@/lib/analytics";

type Props = { searchParams: Promise<Record<string, string>> };

export default async function AnalyticsInboxPage({ searchParams }: Props) {
  const params = await searchParams;
  const brandId = params.brandId ?? "";
  const from = params.from
    ? new Date(params.from)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = params.to ? new Date(params.to) : new Date();

  const data = brandId
    ? await queryInboxDaily({ brandId, from, to }).catch(() => [])
    : [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Volume de conversas e tempo de resposta
        </p>
      </div>
      <Suspense>
        <GlobalFilters brands={[]} />
      </Suspense>
      {brandId ? (
        <InboxHeatmap data={data} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Selecione uma marca para ver os dados.
        </p>
      )}
    </div>
  );
}

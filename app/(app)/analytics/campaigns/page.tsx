import { Suspense } from "react";
import { GlobalFilters } from "@/components/analytics/global-filters";
import { CampaignRoi } from "@/components/analytics/campaign-roi";
import { queryCampaignAttribution } from "@/lib/analytics";

type Props = { searchParams: Promise<Record<string, string>> };

export default async function AnalyticsCampaignsPage({ searchParams }: Props) {
  const params = await searchParams;
  const brandId = params.brandId ?? "";
  const from = params.from
    ? new Date(params.from)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = params.to ? new Date(params.to) : new Date();

  const data = brandId
    ? await queryCampaignAttribution({ brandId, from, to }).catch(() => [])
    : [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Campanhas</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Conversão por campanha (UTM → venda)
        </p>
      </div>
      <Suspense>
        <GlobalFilters brands={[]} />
      </Suspense>
      {brandId ? (
        <CampaignRoi data={data} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Selecione uma marca para ver os dados.
        </p>
      )}
    </div>
  );
}

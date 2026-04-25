import type { OverviewKpis } from "@/lib/analytics/types";

type Props = { kpis: OverviewKpis };

export function OverviewCards({ kpis }: Props) {
  const cards = [
    {
      label: "Receita Bruta",
      value: `R$ ${kpis.grossRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    },
    {
      label: "Transações",
      value: kpis.transactionsCount.toLocaleString("pt-BR"),
    },
    {
      label: "Taxa de Reembolso",
      value: `${(kpis.refundRate * 100).toFixed(1)}%`,
    },
    {
      label: "Conversas Abertas",
      value: kpis.openConversations.toLocaleString("pt-BR"),
    },
    {
      label: "Tempo Médio de Resposta",
      value:
        kpis.avgResponseTimeMinutes != null
          ? `${kpis.avgResponseTimeMinutes.toFixed(0)} min`
          : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border bg-card p-4 shadow-sm"
        >
          <p className="text-muted-foreground text-xs">{card.label}</p>
          <p className="mt-1 text-2xl font-bold">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

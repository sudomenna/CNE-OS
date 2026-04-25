/**
 * MOD-ANALYTICS — tipos de retorno das queries analíticas
 * docs/20-domain/14-analytics.md
 */

export type AnalyticsFilters = {
  brandId: string;
  from: Date;
  to: Date;
  offerId?: string;
  funnelId?: string;
  campaignId?: string;
};

export type SalesByDayRow = {
  day: string; // ISO date "YYYY-MM-DD"
  offerId: string;
  offerName: string;
  transactionsCount: number;
  grossRevenue: number;
  avgTicket: number;
};

export type RefundByDayRow = {
  day: string;
  offerId: string;
  refundsCount: number;
  refundedAmount: number;
};

export type DelinquencyRow = {
  id: string;
  subscriptionId: string;
  contactId: string;
  offerId: string;
  dueAt: string;
  amount: number;
  daysOverdue: number;
};

export type FunnelConversionRow = {
  funnelId: string;
  funnelName: string;
  label: string;
  day: string;
  entriesCount: number;
  avgCycleTimeDays: number | null;
  avgScore: number | null;
};

export type InboxDailyRow = {
  day: string;
  conversationsCount: number;
  openCount: number;
  closedCount: number;
  avgResponseTimeMinutes: number | null;
  overdueCount: number;
};

export type CampaignAttributionRow = {
  campaignId: string;
  campaignName: string;
  funnelId: string;
  entriesCount: number;
  conversionsCount: number;
  conversionRate: number | null;
};

export type OverviewKpis = {
  grossRevenue: number;
  transactionsCount: number;
  refundRate: number;
  avgResponseTimeMinutes: number | null;
  openConversations: number;
};

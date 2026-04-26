import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const CAMPAIGNS_LIST_TABLE_ID = 'campaigns:list' as const

export const CAMPAIGN_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Campanha', alwaysVisible: true },
  { id: 'slug', label: 'Slug', defaultVisible: true },
  { id: 'funnel', label: 'Funil', defaultVisible: true },
  { id: 'period', label: 'Período', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'createdAt', label: 'Criada em', defaultVisible: false },
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

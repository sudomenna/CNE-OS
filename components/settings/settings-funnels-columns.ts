import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const SETTINGS_FUNNELS_TABLE_ID = 'settings:funnels' as const

export const SETTINGS_FUNNELS_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Nome', alwaysVisible: true },
  { id: 'brand', label: 'Marca', defaultVisible: true },
  { id: 'stageCount', label: 'Estágios', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

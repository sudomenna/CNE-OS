import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const CREATIVES_LIST_TABLE_ID = 'campaigns:creatives' as const

export const CREATIVE_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Nome', alwaysVisible: true },
  { id: 'slug', label: 'Slug', defaultVisible: true },
  { id: 'channel', label: 'Canal', defaultVisible: true },
  { id: 'createdAt', label: 'Criado em', defaultVisible: false },
]

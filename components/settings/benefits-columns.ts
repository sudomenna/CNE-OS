import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const SETTINGS_BENEFITS_TABLE_ID = 'settings:benefits' as const

export const BENEFITS_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Nome', alwaysVisible: true },
  { id: 'slug', label: 'Slug', defaultVisible: true },
  { id: 'autoTag', label: 'Tag automática', defaultVisible: true },
  { id: 'defaultDurationMonths', label: 'Vigência padrão', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'createdAt', label: 'Criado em', defaultVisible: false },
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

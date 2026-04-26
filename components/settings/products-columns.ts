import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const SETTINGS_PRODUCTS_TABLE_ID = 'settings:products' as const

export const PRODUCTS_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Nome', alwaysVisible: true },
  { id: 'slug', label: 'Slug', defaultVisible: true },
  { id: 'kind', label: 'Tipo', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'offers', label: 'Ofertas', defaultVisible: true },
  { id: 'createdAt', label: 'Criado em', defaultVisible: false },
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

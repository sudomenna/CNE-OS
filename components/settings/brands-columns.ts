import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const SETTINGS_BRANDS_TABLE_ID = 'settings:brands' as const

export const BRANDS_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Nome', alwaysVisible: true },
  { id: 'slug', label: 'Slug', defaultVisible: true },
  { id: 'primaryColor', label: 'Cor principal', defaultVisible: true },
  { id: 'createdAt', label: 'Criado em', defaultVisible: false },
]

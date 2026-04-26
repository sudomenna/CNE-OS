import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const SETTINGS_CATEGORIES_TABLE_ID = 'settings:categories' as const

export const CATEGORIES_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Nome', alwaysVisible: true },
  { id: 'slug', label: 'Slug', defaultVisible: true },
  { id: 'parentCategory', label: 'Categoria pai', defaultVisible: true },
  { id: 'createdAt', label: 'Criado em', defaultVisible: false },
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

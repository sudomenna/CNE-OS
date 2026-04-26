import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const SETTINGS_LEGAL_ENTITIES_TABLE_ID = 'settings:legal-entities' as const

export const LEGAL_ENTITIES_COLUMNS: ColumnDef[] = [
  { id: 'cnpj', label: 'CNPJ', alwaysVisible: true },
  { id: 'companyName', label: 'Razão social', defaultVisible: true },
  { id: 'tradeName', label: 'Nome fantasia', defaultVisible: true },
  { id: 'brand', label: 'Marca', defaultVisible: true },
  { id: 'isDefault', label: 'Padrão', defaultVisible: true },
]

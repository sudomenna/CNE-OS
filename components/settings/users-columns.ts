import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const SETTINGS_USERS_TABLE_ID = 'settings:users' as const

export const USERS_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Nome', alwaysVisible: true },
  { id: 'email', label: 'E-mail', defaultVisible: true },
  { id: 'role', label: 'Papel', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'createdAt', label: 'Desde', defaultVisible: false },
]

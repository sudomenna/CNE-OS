import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const CONTACT_TICKETS_TABLE_ID = 'contact:tickets' as const

export const CONTACT_TICKETS_COLUMNS: ColumnDef[] = [
  { id: 'id', label: 'ID', alwaysVisible: true },
  { id: 'title', label: 'Título', alwaysVisible: true },
  { id: 'category', label: 'Categoria', defaultVisible: true },
  { id: 'priority', label: 'Prioridade', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  // Avançado — nasce oculto por padrão
  { id: 'assignedTo', label: 'Responsável', defaultVisible: false },
]

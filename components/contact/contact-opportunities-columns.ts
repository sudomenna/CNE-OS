import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const CONTACT_OPPORTUNITIES_TABLE_ID = 'contact:opportunities' as const

export const CONTACT_OPPORTUNITIES_COLUMNS: ColumnDef[] = [
  { id: 'funnel', label: 'Funil', alwaysVisible: true },
  { id: 'stage', label: 'Estágio atual', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'score', label: 'Score', defaultVisible: true },
  // Avançadas — nascem ocultas por padrão
  { id: 'campaign', label: 'Campanha', defaultVisible: false },
  { id: 'createdAt', label: 'Entrada', defaultVisible: true },
]

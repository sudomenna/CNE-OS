import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const BILLING_DELINQUENCY_TABLE_ID = 'billing:delinquency' as const

export const DELINQUENCY_COLUMNS: ColumnDef[] = [
  { id: 'contact', label: 'Contato', alwaysVisible: true },
  { id: 'offer', label: 'Oferta', defaultVisible: true },
  { id: 'brand', label: 'Marca', defaultVisible: true },
  { id: 'totalOverdue', label: 'Total vencido', defaultVisible: true },
  { id: 'oldestDueAt', label: '1ª parcela vencida', defaultVisible: true },
  { id: 'bucket', label: 'Atraso', defaultVisible: true },
  // Avançadas — nascem ocultas; usuário ativa via customizer
  { id: 'ageDays', label: 'Dias em atraso', defaultVisible: false },
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

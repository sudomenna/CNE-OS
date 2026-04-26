import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const TRANSACTION_INSTALLMENTS_TABLE_ID = 'transaction:installments' as const

export const TRANSACTION_INSTALLMENTS_COLUMNS: ColumnDef[] = [
  { id: 'sequence', label: 'N°', alwaysVisible: true },
  { id: 'dueAt', label: 'Vencimento', defaultVisible: true },
  { id: 'amount', label: 'Valor', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'paidAt', label: 'Pago em', defaultVisible: true },
  // Avançado — nasce oculto por padrão
  { id: 'externalId', label: 'Ref. externa', defaultVisible: false },
]

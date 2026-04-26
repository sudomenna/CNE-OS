import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const BILLING_INSTALLMENTS_TABLE_ID = 'billing:installments' as const

export const INSTALLMENT_COLUMNS: ColumnDef[] = [
  { id: 'sequence', label: '#', alwaysVisible: true },
  { id: 'dueAt', label: 'Vencimento', defaultVisible: true },
  { id: 'amount', label: 'Valor', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'paidAt', label: 'Pago em', defaultVisible: true },
  { id: 'retryCount', label: 'Retries', defaultVisible: true },
  // Avançadas — nascem ocultas; usuário ativa via customizer
  { id: 'boletoUrl', label: 'Boleto', defaultVisible: false },
  { id: 'externalId', label: 'ID externo', defaultVisible: false },
  { id: 'actions', label: 'Ação', alwaysVisible: true },
]

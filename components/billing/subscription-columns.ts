import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const BILLING_SUBSCRIPTIONS_TABLE_ID = 'billing:subscriptions' as const

export const SUBSCRIPTION_COLUMNS: ColumnDef[] = [
  { id: 'contact', label: 'Contato', alwaysVisible: true },
  { id: 'offer', label: 'Oferta', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'currentPeriod', label: 'Período Atual', defaultVisible: true },
  { id: 'nextBilling', label: 'Próximo Billing', defaultVisible: true },
  // Avançadas — nascem ocultas; usuário ativa via customizer
  { id: 'cancelledAt', label: 'Cancelada em', defaultVisible: false },
  { id: 'createdAt', label: 'Criada em', defaultVisible: false },
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

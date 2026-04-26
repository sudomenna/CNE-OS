import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const SETTINGS_WEBHOOKS_TABLE_ID = 'settings:webhooks' as const

export const WEBHOOKS_COLUMNS: ColumnDef[] = [
  // alwaysVisible — identificador principal
  { id: 'provider', label: 'Provedor', alwaysVisible: true },
  // defaultVisible — informações operacionais essenciais
  { id: 'eventKind', label: 'Tipo de evento', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'attempts', label: 'Tentativas', defaultVisible: true },
  { id: 'receivedAt', label: 'Recebido em', defaultVisible: true },
  // alwaysVisible — ação de navegação
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

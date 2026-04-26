import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const SETTINGS_AUDIT_TABLE_ID = 'settings:audit' as const

export const AUDIT_COLUMNS: ColumnDef[] = [
  // alwaysVisible — identificador principal do ator
  { id: 'actor', label: 'Ator', alwaysVisible: true },
  // defaultVisible — informações operacionais essenciais
  { id: 'action', label: 'Ação', defaultVisible: true },
  { id: 'resource', label: 'Recurso', defaultVisible: true },
  { id: 'timestamp', label: 'Timestamp', defaultVisible: true },
  // defaultVisible: false — detalhes avançados; úteis para debug mas poluem visão padrão
  { id: 'resourceId', label: 'ID do recurso', defaultVisible: false },
  { id: 'diff', label: 'Diff (before/after)', defaultVisible: true },
]

import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const FUNNELS_LIST_TABLE_ID = 'funnels:list' as const

/**
 * Definição das colunas da tabela de oportunidades (FunnelListView).
 *
 * Colunas obrigatórias (alwaysVisible):
 *   - contact: identificador da oportunidade
 *   - actions: ver perfil do contato
 *
 * Colunas padrão visíveis (defaultVisible: true):
 *   - stage: estágio atual na funil
 *   - status: label da oportunidade (aberta, negociando, etc.)
 *   - score: pontuação de qualificação
 *
 * Colunas avançadas (defaultVisible: false):
 *   - assignee: responsável pela oportunidade
 *   - entryDate: data de entrada no funil
 */
export const FUNNEL_COLUMNS: ColumnDef[] = [
  { id: 'contact', label: 'Contato', alwaysVisible: true },
  { id: 'stage', label: 'Estágio', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'score', label: 'Score', defaultVisible: true },
  // Avançadas — nascem ocultas; usuário ativa via customizer
  { id: 'assignee', label: 'Responsável', defaultVisible: false },
  { id: 'entryDate', label: 'Entrada', defaultVisible: false },
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

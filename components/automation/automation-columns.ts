import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const AUTOMATIONS_LIST_TABLE_ID = 'automations:list' as const

/**
 * Definição de colunas da tabela de automações.
 *
 * Regras de visibilidade (ADR-19):
 *   alwaysVisible  → não pode ser ocultada; aparece disabled no popover.
 *   defaultVisible → visível por padrão no primeiro acesso.
 *   false          → oculta por padrão; usuário ativa via customizador.
 */
export const AUTOMATION_COLUMNS: ColumnDef[] = [
  // Identificador principal — obrigatório
  { id: 'name', label: 'Nome', alwaysVisible: true },
  // Colunas operacionais — visíveis por padrão
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'brand', label: 'Marca', defaultVisible: true },
  // Metadados — ocultos por padrão (menos relevantes no dia a dia)
  { id: 'createdAt', label: 'Criado em', defaultVisible: false },
  // Ações — obrigatória
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

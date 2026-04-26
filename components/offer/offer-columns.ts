/**
 * Definição canônica das colunas da tabela de ofertas.
 * Consumida por OfferList + ColumnsCustomizer (T-16-05).
 * tableId: 'offers:list' — ADR-19, docs/70-ux/12-table-column-customizer.md §3.1
 */

import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const OFFERS_LIST_TABLE_ID = 'offers:list' as const

export const OFFER_COLUMNS: ColumnDef[] = [
  // alwaysVisible: identificador principal
  { id: 'name', label: 'Nome', alwaysVisible: true },

  // defaultVisible: colunas operacionais comuns
  { id: 'brand', label: 'Marca', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },

  // defaultVisible: false — colunas avançadas / pouco usadas no dia-a-dia
  { id: 'slug', label: 'Slug', defaultVisible: false },
  { id: 'createdAt', label: 'Criada em', defaultVisible: false },

  // alwaysVisible: coluna de ações
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]

/**
 * Definição canônica das colunas da tabela de transações.
 * Consumida por TransactionList + ColumnsCustomizer (T-16-06).
 * tableId: 'transactions:list' — ADR-19, docs/70-ux/12-table-column-customizer.md §3.1
 */

import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const TRANSACTIONS_LIST_TABLE_ID = 'transactions:list' as const

export const TRANSACTION_COLUMNS: ColumnDef[] = [
  // alwaysVisible: identificador principal — a data/link de entrada na tabela
  { id: 'date', label: 'Data', alwaysVisible: true },

  // defaultVisible: colunas operacionais comuns
  { id: 'contact', label: 'Contato', defaultVisible: true },
  { id: 'offer', label: 'Oferta', defaultVisible: true },
  { id: 'amount', label: 'Valor', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
]

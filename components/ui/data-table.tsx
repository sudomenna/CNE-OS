'use client'

/**
 * DataTable — tabela genérica com suporte a ordenação acessível.
 *
 * A11y §6 (docs/70-ux/10-accessibility.md):
 *   - <th scope="col"> em todos os cabeçalhos
 *   - aria-sort="ascending|descending|none" em colunas ordenáveis
 *   - Colunas não ordenáveis não recebem aria-sort
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortDirection = 'ascending' | 'descending' | 'none'

export interface DataTableColumn<T> {
  /** Identificador único da coluna */
  key: string
  /** Label exibido no cabeçalho */
  header: string
  /** Renderiza a célula para uma linha */
  cell: (row: T) => React.ReactNode
  /** Se a coluna é ordenável. Padrão: false */
  sortable?: boolean
  /** Classe CSS adicional para o <th> */
  headerClassName?: string
  /** Classe CSS adicional para o <td> */
  cellClassName?: string
}

export interface DataTableSort {
  columnKey: string
  direction: SortDirection
}

export interface DataTableProps<T> {
  /** Colunas da tabela */
  columns: DataTableColumn<T>[]
  /** Dados das linhas */
  rows: T[]
  /** Chave única por linha (usada no key do React) */
  rowKey: (row: T) => string
  /** Estado de ordenação atual */
  sort?: DataTableSort
  /** Callback ao clicar num cabeçalho ordenável */
  onSort?: (columnKey: string, direction: SortDirection) => void
  /** Label descritivo para o <caption> (oculto visualmente quando redundante) */
  caption?: string
  /** Texto exibido quando não há linhas */
  emptyMessage?: string
  /** Classe CSS adicional para o wrapper */
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextDirection(current: SortDirection): SortDirection {
  if (current === 'none') return 'ascending'
  if (current === 'ascending') return 'descending'
  return 'none'
}

function SortIcon({ direction }: { direction: SortDirection }) {
  if (direction === 'ascending') {
    return <ChevronUp className="ml-1 h-4 w-4 shrink-0" aria-hidden="true" />
  }
  if (direction === 'descending') {
    return <ChevronDown className="ml-1 h-4 w-4 shrink-0" aria-hidden="true" />
  }
  return <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-40" aria-hidden="true" />
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  caption,
  emptyMessage = 'Nenhum registro encontrado.',
  className,
}: DataTableProps<T>) {
  function handleHeaderClick(col: DataTableColumn<T>) {
    if (!col.sortable || !onSort) return

    const currentDirection: SortDirection =
      sort?.columnKey === col.key ? sort.direction : 'none'
    const next = nextDirection(currentDirection)
    onSort(col.key, next)
  }

  function getAriaSort(col: DataTableColumn<T>): React.AriaAttributes['aria-sort'] | undefined {
    if (!col.sortable) return undefined
    if (sort?.columnKey !== col.key) return 'none'
    return sort.direction
  }

  return (
    <div className={cn('relative w-full overflow-auto', className)}>
      <table className="w-full caption-bottom text-sm">
        {caption && (
          <caption className="sr-only">{caption}</caption>
        )}

        <thead className="[&_tr]:border-b">
          <tr>
            {columns.map((col) => {
              const ariaSort = getAriaSort(col)
              const isActive = col.sortable && sort?.columnKey === col.key
              const currentDirection: SortDirection =
                isActive ? (sort?.direction ?? 'none') : 'none'

              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(
                    'h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
                    col.sortable && 'cursor-pointer select-none',
                    col.headerClassName,
                  )}
                  onClick={col.sortable ? () => handleHeaderClick(col) : undefined}
                  onKeyDown={
                    col.sortable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleHeaderClick(col)
                          }
                        }
                      : undefined
                  }
                  tabIndex={col.sortable ? 0 : undefined}
                  role={col.sortable ? 'button' : undefined}
                  aria-label={
                    col.sortable
                      ? `${col.header}${ariaSort === 'ascending' ? ', ordenado crescente' : ariaSort === 'descending' ? ', ordenado decrescente' : ', sem ordenação'}`
                      : undefined
                  }
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable && <SortIcon direction={currentDirection} />}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody className="[&_tr:last-child]:border-0">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-muted-foreground/60"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', col.cellClassName)}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

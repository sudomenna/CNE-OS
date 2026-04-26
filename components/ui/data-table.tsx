'use client'

/**
 * DataTable — tabela genérica com suporte a ordenação acessível e visibilidade
 * dinâmica de colunas (opcional, via prop `columnVisibility`).
 *
 * A11y §6 (docs/70-ux/10-accessibility.md):
 *   - <th scope="col"> em todos os cabeçalhos
 *   - aria-sort="ascending|descending|none" em colunas ordenáveis
 *   - Colunas não ordenáveis não recebem aria-sort
 *
 * Visibilidade de colunas (T-16-02 / ADR-19):
 *   - Sem `columnVisibility` → comportamento idêntico ao original (backward-compat total).
 *   - Com `columnVisibility` → instancia `useColumnVisibility` internamente, filtra colunas
 *     e renderiza `<ColumnsCustomizer>` em modo controlado acima da tabela.
 *   - Hydration safety: server começa com defaults; client atualiza via useEffect (1 frame
 *     de flicker aceitável conforme ADR-19).
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { useColumnVisibility, type ColumnDef } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'

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

/**
 * Configuração opcional de visibilidade de colunas.
 * Quando fornecida, `<DataTable>` renderiza um toolbar com `<ColumnsCustomizer>`
 * e filtra colunas com base nas preferências persistidas em localStorage (ADR-19).
 */
export interface DataTableColumnVisibility {
  /**
   * ID da tabela no localStorage.
   * Convenção: `<scope>:<table>` — ex.: 'contacts:list', 'contact:opportunities'.
   * Documentado em docs/70-ux/12-table-column-customizer.md.
   */
  tableId: string
  /**
   * ID do usuário (namespace de preferência).
   * Passado via Server Component → Client para garantir isolamento entre usuários.
   */
  userId: string
  /**
   * Keys de colunas que NÃO podem ser desligadas.
   * Aparece no popover com checkbox disabled.
   * Default: vazio.
   */
  alwaysVisible?: string[]
  /**
   * Keys de colunas que nascem ocultas por padrão (defaultVisible: false).
   * Útil para colunas avançadas que a maioria dos usuários não precisa ver.
   * Default: vazio.
   */
  defaultHidden?: string[]
  /**
   * Label customizado por key, sobrescrevendo `column.header` no popover.
   * Útil quando `header` da DataTableColumn é JSX e o popover precisa de string.
   * Default: usa `column.header` (se string) ou `column.key` (fallback).
   */
  labelOverrides?: Record<string, string>
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
  /**
   * Configuração opcional de visibilidade de colunas.
   * Quando omitida, DataTable funciona idêntico ao comportamento original.
   */
  columnVisibility?: DataTableColumnVisibility
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

/**
 * Constrói a lista de `ColumnDef[]` (formato do hook) a partir das colunas do DataTable
 * e da configuração de visibilidade.
 */
function buildColumnDefs<T>(
  columns: DataTableColumn<T>[],
  cv: DataTableColumnVisibility,
): ColumnDef[] {
  return columns.map((c) => ({
    id: c.key,
    label: cv.labelOverrides?.[c.key] ?? (typeof c.header === 'string' ? c.header : c.key),
    alwaysVisible: cv.alwaysVisible?.includes(c.key) ?? false,
    defaultVisible: cv.defaultHidden?.includes(c.key) ? false : true,
  }))
}

// ---------------------------------------------------------------------------
// DataTable interno com visibilidade (Client-only, pois usa hook)
// ---------------------------------------------------------------------------

function DataTableWithVisibility<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  caption,
  emptyMessage,
  className,
  columnVisibility: cv,
}: DataTableProps<T> & { columnVisibility: DataTableColumnVisibility }) {
  const columnDefs = React.useMemo(() => buildColumnDefs(columns, cv), [columns, cv])

  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: cv.tableId,
    userId: cv.userId,
    columns: columnDefs,
  })

  // Filtrar colunas pelo resultado do hook
  const visibleColumns = columns.filter((col) => isVisible(col.key))

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

  // Não renderizar toolbar se não houver colunas definidas
  const showToolbar = columns.length > 0

  return (
    <div className={cn('relative w-full overflow-auto', className)}>
      {showToolbar && (
        <div className="flex items-center justify-end mb-2">
          {/* Modo controlado: hook instanciado aqui, passamos visibleColumnIds + toggle + reset */}
          <ColumnsCustomizer
            tableId={cv.tableId}
            userId={cv.userId}
            columns={columnDefs}
            visibleColumnIds={visibleColumnIds}
            onToggle={toggle}
            onReset={reset}
          />
        </div>
      )}

      <table className="w-full caption-bottom text-sm">
        {caption && (
          <caption className="sr-only">{caption}</caption>
        )}

        <thead className="[&_tr]:border-b">
          <tr>
            {visibleColumns.map((col) => {
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
                colSpan={visibleColumns.length}
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
                {visibleColumns.map((col) => (
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

// ---------------------------------------------------------------------------
// DataTable (export público — entry point)
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
  columnVisibility,
}: DataTableProps<T>) {
  // Com columnVisibility: delega ao componente interno que usa hooks
  if (columnVisibility) {
    return (
      <DataTableWithVisibility
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        {...(sort !== undefined ? { sort } : {})}
        {...(onSort !== undefined ? { onSort } : {})}
        {...(caption !== undefined ? { caption } : {})}
        emptyMessage={emptyMessage ?? 'Nenhum registro encontrado.'}
        {...(className !== undefined ? { className } : {})}
        columnVisibility={columnVisibility}
      />
    )
  }

  // Sem columnVisibility: comportamento original idêntico (backward-compat)
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

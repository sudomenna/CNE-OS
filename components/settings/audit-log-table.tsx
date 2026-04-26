'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { AUDIT_COLUMNS, SETTINGS_AUDIT_TABLE_ID } from './audit-columns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditLogRow = {
  id: string
  actorEmail: string | null
  actorSystem: string | null
  actionKind: string
  resourceKind: string
  resourceId: string | null
  before: Record<string, unknown>
  after: Record<string, unknown>
  createdAt: string // ISO string
}

export type AuditLogTableProps = {
  rows: AuditLogRow[]
  page: number
  hasNext: boolean
  /**
   * ID do usuário autenticado que está visualizando a tabela.
   * Usado como namespace no localStorage para o customizador de colunas.
   * NÃO confundir com o parâmetro `userId` do formulário de filtro,
   * que é o e-mail/ID do ator que se quer buscar nos logs.
   */
  viewerUserId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTION_KIND_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Atualização',
  delete: 'Exclusão',
  merge: 'Mesclagem',
  unmerge: 'Desmesclagem',
  refund: 'Reembolso',
  status_change: 'Mudança de status',
  impersonate: 'Impersonação',
  other: 'Outro',
}

const AUDIT_ACTION_KINDS = [
  'create',
  'update',
  'delete',
  'merge',
  'unmerge',
  'refund',
  'status_change',
  'impersonate',
  'other',
] as const

const RESOURCE_KINDS = [
  'contact',
  'offer',
  'transaction',
  'funnel',
  'ticket',
  'campaign',
  'user_account',
  'automation',
  'catalog',
  'webhook',
  'billing',
] as const

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortId(id: string | null): string {
  if (!id) return '—'
  return id.slice(0, 8) + '…'
}

// ---------------------------------------------------------------------------
// DiffCell — expands JSON inline on click
// ---------------------------------------------------------------------------

function DiffCell({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  const hasData =
    Object.keys(before).length > 0 || Object.keys(after).length > 0

  if (!hasData) {
    return <span className="text-muted-foreground/40 text-xs">—</span>
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Ocultar diff JSON' : 'Ver diff JSON'}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-muted hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
        {open ? 'Ocultar' : 'Ver diff'}
      </button>
      {open && (
        <pre className="mt-2 rounded bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all text-foreground/80 max-w-xs">
          {JSON.stringify({ before, after }, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterForm
// ---------------------------------------------------------------------------

function FilterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const params = new URLSearchParams()

    // NOTE: `userId` aqui é o campo de filtro por ator (e-mail do ator nos logs),
    // completamente separado do `viewerUserId` prop do componente pai.
    const userId = (data.get('userId') as string | null)?.trim()
    const actionKind = data.get('actionKind') as string | null
    const resourceKind = data.get('resourceKind') as string | null
    const dateFrom = data.get('dateFrom') as string | null
    const dateTo = data.get('dateTo') as string | null

    if (userId) params.set('userId', userId)
    if (actionKind && actionKind !== '_all') params.set('actionKind', actionKind)
    if (resourceKind && resourceKind !== '_all') params.set('resourceKind', resourceKind)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    params.set('page', '1')

    startTransition(() => {
      router.push(`/settings/audit?${params.toString()}`)
    })
  }

  function handleClear() {
    startTransition(() => {
      router.push('/settings/audit?page=1')
    })
  }

  const currentActionKind = searchParams.get('actionKind') ?? '_all'
  const currentResourceKind = searchParams.get('resourceKind') ?? '_all'

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 space-y-4"
      aria-label="Filtros do log de auditoria"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="audit-userId">Usuário (e-mail)</Label>
          <Input
            id="audit-userId"
            name="userId"
            type="text"
            placeholder="usuario@exemplo.com"
            defaultValue={searchParams.get('userId') ?? ''}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-actionKind">Ação</Label>
          <Select name="actionKind" defaultValue={currentActionKind}>
            <SelectTrigger id="audit-actionKind">
              <SelectValue placeholder="Todas as ações" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas as ações</SelectItem>
              {AUDIT_ACTION_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {ACTION_KIND_LABELS[k] ?? k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-resourceKind">Tipo de recurso</Label>
          <Select name="resourceKind" defaultValue={currentResourceKind}>
            <SelectTrigger id="audit-resourceKind">
              <SelectValue placeholder="Todos os recursos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os recursos</SelectItem>
              {RESOURCE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-dateFrom">De</Label>
          <Input
            id="audit-dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={searchParams.get('dateFrom') ?? ''}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="audit-dateTo">Até</Label>
          <Input
            id="audit-dateTo"
            name="dateTo"
            type="date"
            defaultValue={searchParams.get('dateTo') ?? ''}
          />
        </div>

        <div className="flex items-end gap-2 lg:col-span-3">
          <Button type="submit" size="sm">
            Filtrar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            Limpar filtros
          </Button>
        </div>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({ page, hasNext }: { page: number; hasNext: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    startTransition(() => {
      router.push(`/settings/audit?${params.toString()}`)
    })
  }

  return (
    <nav
      className="flex items-center justify-between px-4 py-3 border-t border-border"
      aria-label="Paginação do log de auditoria"
    >
      <span className="text-sm text-muted-foreground">
        Página {page}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
          aria-label="Página anterior"
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => goToPage(page + 1)}
          aria-label="Próxima página"
        >
          Próxima
        </Button>
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// AuditLogTable — main export
// ---------------------------------------------------------------------------

export function AuditLogTable({ rows, page, hasNext, viewerUserId }: AuditLogTableProps) {
  // Hook de visibilidade de colunas — usa viewerUserId como namespace no localStorage
  // (distinto do campo `userId` do formulário de filtro, que busca por ator nos logs)
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: SETTINGS_AUDIT_TABLE_ID,
    userId: viewerUserId,
    columns: AUDIT_COLUMNS,
  })

  return (
    <div className="space-y-4">
      <FilterForm />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Toolbar com customizador de colunas */}
        <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-muted/30">
          <ColumnsCustomizer
            tableId={SETTINGS_AUDIT_TABLE_ID}
            userId={viewerUserId}
            columns={AUDIT_COLUMNS}
            visibleColumnIds={visibleColumnIds}
            onToggle={toggle}
            onReset={reset}
          />
        </div>

        <div className="overflow-x-auto">
          <table
            className="w-full text-sm"
            aria-label="Trilha de auditoria"
          >
            <thead className="border-b border-border bg-muted/50">
              <tr>
                {/* actor — alwaysVisible */}
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  Ator
                </th>
                {isVisible('action') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    Ação
                  </th>
                )}
                {isVisible('resource') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    Recurso
                  </th>
                )}
                {isVisible('resourceId') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    ID do recurso
                  </th>
                )}
                {isVisible('timestamp') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    Timestamp
                  </th>
                )}
                {isVisible('diff') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    Diff
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumnIds.size}
                    className="px-4 py-10 text-center text-muted-foreground/60"
                  >
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    {/* actor — alwaysVisible */}
                    <td className="px-4 py-3 text-foreground">
                      {row.actorEmail ?? row.actorSystem ?? (
                        <span className="text-muted-foreground/50 italic">Sistema</span>
                      )}
                    </td>
                    {isVisible('action') && (
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {ACTION_KIND_LABELS[row.actionKind] ?? row.actionKind}
                        </span>
                      </td>
                    )}
                    {isVisible('resource') && (
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        <span className="font-semibold text-foreground">{row.resourceKind}</span>
                      </td>
                    )}
                    {isVisible('resourceId') && (
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {row.resourceId ? (
                          <span title={row.resourceId}>
                            #{shortId(row.resourceId)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    )}
                    {isVisible('timestamp') && (
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(row.createdAt)}
                      </td>
                    )}
                    {isVisible('diff') && (
                      <td className="px-4 py-3">
                        <DiffCell before={row.before} after={row.after} />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} hasNext={hasNext} />
      </div>
    </div>
  )
}

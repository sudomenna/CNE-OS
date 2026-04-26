'use client'

/**
 * TabTickets — Client Component
 *
 * Exibe a lista de tickets vinculados a um contato com customizador de colunas.
 * tableId: contact:tickets (ADR-19)
 *
 * Recebe dados como props (fetched no Server Component pai: contacts/[id]/page.tsx).
 *
 * docs/20-domain/06-ticket.md
 * Task: T-12-10, T-16-14
 */

import Link from 'next/link'
import type { Route } from 'next'
import { LifeBuoy } from 'lucide-react'

import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import {
  CONTACT_TICKETS_TABLE_ID,
  CONTACT_TICKETS_COLUMNS,
} from './contact-tickets-columns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TicketRow {
  id: string
  title: string
  category: string
  priority: string
  status: string
  assignedUserId: string | null
  createdAt: Date | string
}

// ---------------------------------------------------------------------------
// Priority badge
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

const PRIORITY_CLASSES: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

function PriorityBadge({ priority }: { priority: string }) {
  const label = PRIORITY_LABELS[priority] ?? priority
  const classes =
    PRIORITY_CLASSES[priority] ?? 'bg-muted text-muted-foreground'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_reply: 'Aguardando',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
}

const STATUS_CLASSES: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  waiting_reply: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  resolved: 'bg-muted text-muted-foreground',
  cancelled: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status
  const classes =
    STATUS_CLASSES[status] ?? 'bg-muted text-muted-foreground'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Category label
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  commercial: 'Comercial',
  support: 'Suporte',
  financial: 'Financeiro',
  cancellation: 'Cancelamento',
  refund: 'Reembolso',
  access: 'Acesso',
  registration: 'Cadastro',
  other: 'Outro',
}

// ---------------------------------------------------------------------------
// CTA — link para novo ticket com contato pre-preenchido
// ---------------------------------------------------------------------------

function NewTicketLink({ contactId }: { contactId: string }) {
  return (
    <Link
      href={`/tickets/new?contact=${contactId}` as Route}
      className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Abrir ticket
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ contactId }: { contactId: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 gap-3 text-center">
      <LifeBuoy
        className="h-8 w-8 text-muted-foreground/40"
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">Nenhum ticket encontrado</p>
      <NewTicketLink contactId={contactId} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TabTicketsProps {
  contactId: string
  userId: string
  rows: TicketRow[]
}

export function TabTickets({ contactId, userId, rows }: TabTicketsProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: CONTACT_TICKETS_TABLE_ID,
    userId,
    columns: CONTACT_TICKETS_COLUMNS,
  })

  if (rows.length === 0) {
    return <EmptyState contactId={contactId} />
  }

  return (
    <div className="space-y-3">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={CONTACT_TICKETS_TABLE_ID}
          userId={userId}
          columns={CONTACT_TICKETS_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50">
            <tr>
              {/* id — alwaysVisible */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                ID
              </th>
              {/* title — alwaysVisible */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Título
              </th>
              {isVisible('category') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
                >
                  Categoria
                </th>
              )}
              {isVisible('priority') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
                >
                  Prioridade
                </th>
              )}
              {isVisible('status') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
                >
                  Status
                </th>
              )}
              {isVisible('assignedTo') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
                >
                  Responsável
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-muted/30 transition-colors"
              >
                {/* ID — alwaysVisible */}
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                  <Link
                    href={`/tickets/${row.id}` as Route}
                    className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-label={`Ticket ${row.id.slice(0, 8)}`}
                  >
                    #{row.id.slice(0, 8)}
                  </Link>
                </td>

                {/* Título — alwaysVisible */}
                <td className="px-4 py-3 max-w-xs">
                  <Link
                    href={`/tickets/${row.id}` as Route}
                    className="line-clamp-1 text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {row.title}
                  </Link>
                </td>

                {isVisible('category') && (
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {CATEGORY_LABELS[row.category] ?? row.category}
                  </td>
                )}

                {isVisible('priority') && (
                  <td className="px-4 py-3 whitespace-nowrap">
                    <PriorityBadge priority={row.priority} />
                  </td>
                )}

                {isVisible('status') && (
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={row.status} />
                  </td>
                )}

                {isVisible('assignedTo') && (
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {row.assignedUserId ? (
                      <span className="font-mono text-xs">{row.assignedUserId.slice(0, 8)}</span>
                    ) : (
                      <span aria-label="Sem responsável">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer CTA */}
      <div className="flex justify-end">
        <NewTicketLink contactId={contactId} />
      </div>
    </div>
  )
}

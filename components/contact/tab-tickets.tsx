/**
 * TabTickets — Server Component
 *
 * Exibe a lista de tickets vinculados a um contato.
 * Consumido pela aba "Tickets" na página de detalhe do contato (T-12-10).
 * O wiring na page.tsx é feito em T-12-16.
 *
 * docs/20-domain/06-ticket.md
 * docs/20-domain/02-contact-identity.md §T-1-15
 */
import Link from 'next/link'
import type { Route } from 'next'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { LifeBuoy } from 'lucide-react'

import { db } from '@/lib/db/client'
import { ticket } from '@/lib/db/schema/ticket'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TabTicketsProps {
  contactId: string
}

// ---------------------------------------------------------------------------
// Priority badge
//
// Enum values: low | medium | high | urgent
// Task spec maps: critical→red, high→orange, medium→yellow, low→gray
// "urgent" is the highest priority in the enum, so maps to red.
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
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
//
// Enum values: open | in_progress | waiting_reply | resolved | cancelled
// Task spec maps: open→green, in_progress→blue, resolved→gray, closed/cancelled→dark gray
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
// Não usa OpenTicketButton porque este é um Server Component e OpenTicketButton
// requer brandId que não está disponível neste contexto.
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

export async function TabTickets({ contactId }: TabTicketsProps) {
  const rows = await db
    .select({
      id: ticket.id,
      title: ticket.title,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedUserId: ticket.assignedUserId,
      createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(eq(ticket.contactId, contactId), isNull(ticket.deletedAt)))
    .orderBy(desc(ticket.createdAt))
    .limit(50)

  if (rows.length === 0) {
    return <EmptyState contactId={contactId} />
  }

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                ID
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Titulo
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Categoria
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Prioridade
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Responsavel
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-muted/30 transition-colors"
              >
                {/* ID curto */}
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                  <Link
                    href={`/tickets/${row.id}` as Route}
                    className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-label={`Ticket ${row.id.slice(0, 8)}`}
                  >
                    #{row.id.slice(0, 8)}
                  </Link>
                </td>

                {/* Titulo */}
                <td className="px-4 py-3 max-w-xs">
                  <Link
                    href={`/tickets/${row.id}` as Route}
                    className="line-clamp-1 text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {row.title}
                  </Link>
                </td>

                {/* Categoria */}
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {CATEGORY_LABELS[row.category] ?? row.category}
                </td>

                {/* Prioridade */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <PriorityBadge priority={row.priority} />
                </td>

                {/* Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={row.status} />
                </td>

                {/* Responsavel */}
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {row.assignedUserId ? (
                    <span className="font-mono text-xs">{row.assignedUserId.slice(0, 8)}</span>
                  ) : (
                    <span aria-label="Sem responsavel">—</span>
                  )}
                </td>
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

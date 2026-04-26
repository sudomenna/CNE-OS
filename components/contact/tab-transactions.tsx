/**
 * TabTransactions — Server Component
 * T-12-12: Contact tab listing transactions for a given contact.
 *
 * Ownership: components/contact/tab-transactions.tsx
 * Wiring into page.tsx: T-12-16.
 */

import Link from 'next/link'
import { CreditCard } from 'lucide-react'
import { desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { transaction } from '@/lib/db/schema/transaction'
import { offer } from '@/lib/db/schema/offer'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TabTransactionsProps {
  contactId: string
}

type TransactionRow = {
  id: string
  offerName: string | null
  offerConditionId: string
  amount: string
  status: 'pending' | 'approved' | 'refused' | 'refunded' | 'chargeback' | 'cancelled'
  externalProvider: string | null
  approvedAt: Date | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format amount stored as numeric(12,2) in BRL reais. */
function formatBRL(amount: string): string {
  const value = parseFloat(amount)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/** Format date as dd/MM/yyyy; returns "—" for null. */
function formatDate(date: Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/** Short ID: "#" + first 8 chars of UUID. */
function shortId(id: string): string {
  return `#${id.slice(0, 8)}`
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline'

interface BadgeConfig {
  label: string
  /** Tailwind classes applied over the badge for semantic coloring */
  className: string
  variant: StatusVariant
}

const STATUS_CONFIG: Record<TransactionRow['status'], BadgeConfig> = {
  approved: {
    label: 'Aprovada',
    className:
      'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
    variant: 'outline',
  },
  pending: {
    label: 'Pendente',
    className:
      'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
    variant: 'outline',
  },
  refunded: {
    label: 'Reembolsada',
    className:
      'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    variant: 'outline',
  },
  chargeback: {
    label: 'Chargeback',
    className:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    variant: 'outline',
  },
  cancelled: {
    label: 'Cancelada',
    className:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    variant: 'outline',
  },
  refused: {
    label: 'Recusada',
    className:
      'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700',
    variant: 'outline',
  },
}

function StatusBadge({ status }: { status: TransactionRow['status'] }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-600 border-gray-200',
    variant: 'outline' as const,
  }
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16"
      aria-label="Nenhuma transação encontrada"
    >
      <CreditCard className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Nenhuma transação encontrada</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export async function TabTransactions({ contactId }: TabTransactionsProps) {
  const rows = await db
    .select({
      id: transaction.id,
      offerName: offer.name,
      offerConditionId: transaction.offerConditionId,
      amount: transaction.amount,
      status: transaction.status,
      externalProvider: transaction.externalProvider,
      approvedAt: transaction.approvedAt,
    })
    .from(transaction)
    .leftJoin(offer, eq(transaction.offerId, offer.id))
    .where(eq(transaction.contactId, contactId))
    .orderBy(desc(transaction.createdAt))
    .limit(50)

  if (rows.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-28">
              ID
            </TableHead>
            <TableHead scope="col">Oferta</TableHead>
            <TableHead scope="col" className="w-36">
              Condição
            </TableHead>
            <TableHead scope="col" className="w-36 text-right">
              Valor
            </TableHead>
            <TableHead scope="col" className="w-32">
              Status
            </TableHead>
            <TableHead scope="col" className="w-36">
              Provedor
            </TableHead>
            <TableHead scope="col" className="w-32">
              Data aprovação
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-muted/50">
              <TableCell>
                <Link
                  href={`/transactions/${row.id}`}
                  className="font-mono text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {shortId(row.id)}
                </Link>
              </TableCell>
              <TableCell className="font-medium">
                {row.offerName ?? (
                  <span className="text-muted-foreground/60 italic">—</span>
                )}
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs text-muted-foreground">
                  {shortId(row.offerConditionId)}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBRL(row.amount)}
              </TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell className="text-sm">
                {row.externalProvider ?? (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {formatDate(row.approvedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

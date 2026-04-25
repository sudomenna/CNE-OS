/**
 * SubscriptionCard — linha/card de assinatura para a lista.
 * Server Component (sem interatividade).
 * T-9-14: docs/20-domain/13-subscription-billing.md §3.1, §6.1
 */

import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import type { SubscriptionListItem, SubscriptionStatus } from '@/app/(app)/billing/subscriptions/queries'

// ---------------------------------------------------------------------------
// Helpers de status
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Ativa',
  past_due: 'Inadimplente',
  paused: 'Pausada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}

const STATUS_VARIANT: Record<SubscriptionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  trial: 'secondary',
  active: 'default',
  past_due: 'destructive',
  paused: 'secondary',
  cancelled: 'outline',
  expired: 'outline',
}

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface SubscriptionCardProps {
  subscription: SubscriptionListItem
}

export function SubscriptionCard({ subscription: sub }: SubscriptionCardProps) {
  return (
    <tr className="hover:bg-muted/50 transition-colors">
      {/* Contato */}
      <td className="px-4 py-3">
        <Link
          href={`/contacts/${sub.contactId}` as Route}
          className="font-medium text-foreground hover:text-muted-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded truncate max-w-[200px] block"
        >
          {sub.contactName}
        </Link>
      </td>

      {/* Oferta */}
      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
        <Link
          href={`/offers/${sub.offerId}` as Route}
          className="hover:text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          {sub.offerName}
        </Link>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <Badge variant={STATUS_VARIANT[sub.status]}>
          {STATUS_LABEL[sub.status]}
        </Badge>
      </td>

      {/* Período atual */}
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap tabular-nums text-sm">
        {formatDate(sub.currentPeriodStart)} – {formatDate(sub.currentPeriodEnd)}
      </td>

      {/* Próximo billing */}
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap tabular-nums text-sm">
        {formatDate(sub.nextBillingAt)}
      </td>

      {/* Link detalhe */}
      <td className="px-4 py-3 text-right">
        <Link
          href={`/billing/subscriptions/${sub.id}` as Route}
          className="text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          Detalhe
        </Link>
      </td>
    </tr>
  )
}

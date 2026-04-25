'use client'

/**
 * ItemRow — linha de item de condição de oferta.
 * Exibe: kind (badge), nome do produto/benefício, quantidade, vigência e desconto.
 *
 * T-6-20 — spec: docs/20-domain/10-offer-engine.md §3.5, INV-OFFER-07
 */

import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OfferConditionItemKind =
  | 'main'
  | 'bonus'
  | 'upsell'
  | 'order_bump'
  | 'complement'
  | 'commercial_benefit'

export interface ItemRowData {
  id: string
  kind: OfferConditionItemKind
  /** Populated when kind != 'commercial_benefit' */
  productName?: string | null
  /** Populated when kind == 'commercial_benefit' */
  benefitName?: string | null
  quantity: number
  /** NULL means perpetuous (vitalício) */
  vigencyMonths: number | null
  /** Percentual 0-100, nullable */
  discount: string | null
  orderIndex: number
}

interface ItemRowProps {
  item: ItemRowData
}

// ---------------------------------------------------------------------------
// Kind badge helpers
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<OfferConditionItemKind, string> = {
  main: 'Principal',
  bonus: 'Bônus',
  upsell: 'Upsell',
  order_bump: 'Order Bump',
  complement: 'Complemento',
  commercial_benefit: 'Benefício Comercial',
}

const KIND_CLASS: Record<OfferConditionItemKind, string> = {
  main: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  bonus: 'bg-green-100 text-green-700 hover:bg-green-100',
  upsell: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
  order_bump: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  complement: 'bg-teal-100 text-teal-700 hover:bg-teal-100',
  commercial_benefit: 'bg-pink-100 text-pink-700 hover:bg-pink-100',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ItemRow({ item }: ItemRowProps) {
  // INV-OFFER-07: kind='commercial_benefit' usa benefitName; demais usam productName
  const displayName =
    item.kind === 'commercial_benefit'
      ? (item.benefitName ?? '—')
      : (item.productName ?? '—')

  const vigencyLabel =
    item.vigencyMonths == null
      ? 'Vitalício'
      : item.vigencyMonths === 1
        ? '1 mês'
        : `${item.vigencyMonths} meses`

  const discountLabel =
    item.discount != null
      ? `${Number(item.discount).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% desc.`
      : null

  return (
    <div
      role="row"
      className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm"
    >
      {/* Kind badge */}
      <Badge
        variant="secondary"
        className={KIND_CLASS[item.kind] ?? ''}
        aria-label={`Tipo: ${KIND_LABEL[item.kind]}`}
      >
        {KIND_LABEL[item.kind]}
      </Badge>

      {/* Nome do produto ou benefício */}
      <span className="flex-1 font-medium text-foreground min-w-0 truncate">
        {displayName}
      </span>

      {/* Quantidade */}
      <span
        className="text-xs text-muted-foreground tabular-nums"
        aria-label={`Quantidade: ${item.quantity}`}
      >
        Qtd: <strong className="text-muted-foreground">{item.quantity}</strong>
      </span>

      {/* Vigência */}
      <span
        className="text-xs text-muted-foreground"
        aria-label={`Vigência: ${vigencyLabel}`}
      >
        {vigencyLabel}
      </span>

      {/* Desconto (opcional) */}
      {discountLabel && (
        <span
          className="text-xs text-muted-foreground"
          aria-label={`Desconto: ${discountLabel}`}
        >
          {discountLabel}
        </span>
      )}
    </div>
  )
}

'use server'

/**
 * MOD-TRANSACTION — Server Actions de leitura
 * T-8-16: UI /transactions lista + detalhe + snapshot viewer read-only
 *
 * Spec: docs/20-domain/11-transaction-snapshot.md
 * Contract: docs/30-contracts/05-api-server-actions.md
 * RBAC: Leituras usam requireSession() apenas (sem requirePermission —
 *       consistente com o padrão de outras listagens read-only neste projeto).
 */

import { z } from 'zod'
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import {
  transaction,
  transactionSnapshot,
  transactionItem,
  transactionStatusHistory,
} from '@/lib/db/schema/transaction'
import { refund } from '@/lib/db/schema/refund'
import { contact, contactEmail } from '@/lib/db/schema/contact'
import { offer } from '@/lib/db/schema/offer'
import { requireSession } from '@/lib/auth/session'
import { toActionResult, ActionError } from '@/lib/actions/result'

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const getTransactionsSchema = z.object({
  status: z
    .enum(['pending', 'approved', 'refused', 'refunded', 'chargeback', 'cancelled'])
    .optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
})

const getTransactionSchema = z.object({
  id: z.string().uuid(),
})

const hasActiveRefundSchema = z.object({
  transactionId: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export type TransactionListItem = {
  id: string
  status: 'pending' | 'approved' | 'refused' | 'refunded' | 'chargeback' | 'cancelled'
  amount: string
  currency: string
  createdAt: Date
  approvedAt: Date | null
  refusedAt: Date | null
  externalId: string | null
  contactId: string
  contactName: string
  contactEmail: string | null
  offerId: string
  offerName: string
}

export type SnapshotPayload = {
  version: 1
  captured_at: string
  brand: { id: string; name: string; slug: string }
  legal_entity: {
    id: string
    cnpj: string
    company_name: string
    tax_regime?: string
  }
  offer: {
    id: string
    name: string
    slug: string
    type: 'regular' | 'renewal'
    renews_offer_id?: string
  }
  condition: {
    id: string
    name: string
    priority: number
    advantage_score: number
    is_default: boolean
    is_public: boolean
  }
  rules: {
    group_id: string
    operator: 'and' | 'or'
    children: unknown[]
    evaluation: 'match' | 'fallback_default'
    context_snapshot: {
      campaign_id?: string
      creative_id?: string
      channel?: string
      is_internal?: boolean
    }
  }
  items: Array<{
    condition_item_id: string
    kind: 'main' | 'bonus' | 'upsell' | 'order_bump' | 'complement' | 'commercial_benefit'
    product?: { id: string; name: string; slug: string; kind: string }
    commercial_benefit?: { id: string; name: string; slug: string; auto_tag?: string }
    quantity: number
    access_rule: Record<string, unknown>
    vigency_months: number | null
    discount: number | null
    responsible_user_id: string | null
  }>
  payment_option: {
    id: string
    method: string
    price: number
    installments: number | null
    custom_config: Record<string, unknown>
  }
  source: {
    provider?: string
    external_id?: string
    raw_event_id?: string
  }
}

export type TransactionDetail = {
  id: string
  status: 'pending' | 'approved' | 'refused' | 'refunded' | 'chargeback' | 'cancelled'
  amount: string
  currency: string
  externalProvider: string | null
  externalId: string | null
  externalFee: string | null
  createdAt: Date
  updatedAt: Date
  approvedAt: Date | null
  refusedAt: Date | null
  contactId: string
  contactName: string
  contactEmail: string | null
  offerId: string
  offerName: string
  snapshot: {
    id: string
    flag: 'normal' | 'refunded' | 'disputed'
    payload: SnapshotPayload
    createdAt: Date
  } | null
  items: Array<{
    id: string
    itemKind: string
    productId: string | null
    commercialBenefitId: string | null
    quantity: number
    resolvedRules: Record<string, unknown>
    deliveryStatus: string
    responsibleUserId: string | null
    createdAt: Date
  }>
  statusHistory: Array<{
    id: string
    fromStatus: string | null
    toStatus: string
    changedBy: string | null
    actorSystem: string | null
    reason: string | null
    createdAt: Date
  }>
}

// ---------------------------------------------------------------------------
// getTransactions — lista paginada
// ---------------------------------------------------------------------------

export async function getTransactions(rawInput: unknown) {
  return toActionResult(async () => {
    await requireSession()
    const input = getTransactionsSchema.parse(rawInput ?? {})

    const { status, dateFrom, dateTo, page, pageSize } = input
    const offset = (page - 1) * pageSize

    // Condições de filtro
    const conditions = [
      ...(status ? [eq(transaction.status, status)] : []),
      ...(dateFrom ? [gte(transaction.createdAt, new Date(dateFrom))] : []),
      ...(dateTo ? [lte(transaction.createdAt, new Date(dateTo))] : []),
    ]

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: transaction.id,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          createdAt: transaction.createdAt,
          approvedAt: transaction.approvedAt,
          refusedAt: transaction.refusedAt,
          externalId: transaction.externalId,
          contactId: transaction.contactId,
          contactName: contact.fullName,
          offerId: transaction.offerId,
          offerName: offer.name,
        })
        .from(transaction)
        .innerJoin(contact, eq(contact.id, transaction.contactId))
        .innerJoin(offer, eq(offer.id, transaction.offerId))
        .where(whereClause)
        .orderBy(desc(transaction.createdAt))
        .limit(pageSize)
        .offset(offset),

      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(transaction)
        .where(whereClause),
    ])

    // Buscar email primário dos contatos em lote
    const contactIds = [...new Set(rows.map((r) => r.contactId))]
    const emailRows =
      contactIds.length > 0
        ? await db
            .select({ contactId: contactEmail.contactId, email: contactEmail.email })
            .from(contactEmail)
            .where(
              and(
                inArray(contactEmail.contactId, contactIds),
                eq(contactEmail.status, 'primary'),
              ),
            )
            .limit(contactIds.length)
        : []

    const emailByContact = new Map(emailRows.map((e) => [e.contactId, e.email]))

    const items: TransactionListItem[] = rows.map((r) => ({
      ...r,
      contactEmail: emailByContact.get(r.contactId) ?? null,
    }))

    const total = countResult[0]?.count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return { items, total, page, pageSize, totalPages }
  })
}

// ---------------------------------------------------------------------------
// getTransaction — detalhe com snapshot + items + status_history
// ---------------------------------------------------------------------------

export async function getTransaction(rawInput: unknown) {
  return toActionResult(async () => {
    await requireSession()
    const { id } = getTransactionSchema.parse(rawInput)

    // Buscar transação com joins
    const rows = await db
      .select({
        id: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        externalProvider: transaction.externalProvider,
        externalId: transaction.externalId,
        externalFee: transaction.externalFee,
        snapshotId: transaction.snapshotId,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        approvedAt: transaction.approvedAt,
        refusedAt: transaction.refusedAt,
        contactId: transaction.contactId,
        contactName: contact.fullName,
        offerId: transaction.offerId,
        offerName: offer.name,
      })
      .from(transaction)
      .innerJoin(contact, eq(contact.id, transaction.contactId))
      .innerJoin(offer, eq(offer.id, transaction.offerId))
      .where(eq(transaction.id, id))
      .limit(1)

    const trx = rows[0]
    if (!trx) {
      throw new ActionError('NOT_FOUND', `Transação ${id} não encontrada`)
    }

    // Email do contato
    const emailRows = await db
      .select({ email: contactEmail.email })
      .from(contactEmail)
      .where(and(eq(contactEmail.contactId, trx.contactId), eq(contactEmail.status, 'primary')))
      .limit(1)

    const contactEmailValue = emailRows[0]?.email ?? null

    // Buscar snapshot
    let snapshotData: TransactionDetail['snapshot'] = null
    if (trx.snapshotId) {
      const snapshotRows = await db
        .select({
          id: transactionSnapshot.id,
          flag: transactionSnapshot.flag,
          payload: transactionSnapshot.payload,
          createdAt: transactionSnapshot.createdAt,
        })
        .from(transactionSnapshot)
        .where(eq(transactionSnapshot.transactionId, id))
        .limit(1)

      const snap = snapshotRows[0]
      if (snap) {
        snapshotData = {
          id: snap.id,
          flag: snap.flag,
          payload: snap.payload as unknown as SnapshotPayload,
          createdAt: snap.createdAt,
        }
      }
    }

    // Buscar transaction_items
    const itemRows = await db
      .select({
        id: transactionItem.id,
        itemKind: transactionItem.itemKind,
        productId: transactionItem.productId,
        commercialBenefitId: transactionItem.commercialBenefitId,
        quantity: transactionItem.quantity,
        resolvedRules: transactionItem.resolvedRules,
        deliveryStatus: transactionItem.deliveryStatus,
        responsibleUserId: transactionItem.responsibleUserId,
        createdAt: transactionItem.createdAt,
      })
      .from(transactionItem)
      .where(eq(transactionItem.transactionId, id))
      .orderBy(transactionItem.createdAt)

    // Buscar status history
    const historyRows = await db
      .select({
        id: transactionStatusHistory.id,
        fromStatus: transactionStatusHistory.fromStatus,
        toStatus: transactionStatusHistory.toStatus,
        changedBy: transactionStatusHistory.changedBy,
        actorSystem: transactionStatusHistory.actorSystem,
        reason: transactionStatusHistory.reason,
        createdAt: transactionStatusHistory.createdAt,
      })
      .from(transactionStatusHistory)
      .where(eq(transactionStatusHistory.transactionId, id))
      .orderBy(transactionStatusHistory.createdAt)

    const detail: TransactionDetail = {
      id: trx.id,
      status: trx.status,
      amount: trx.amount,
      currency: trx.currency,
      externalProvider: trx.externalProvider ?? null,
      externalId: trx.externalId ?? null,
      externalFee: trx.externalFee ?? null,
      createdAt: trx.createdAt,
      updatedAt: trx.updatedAt,
      approvedAt: trx.approvedAt ?? null,
      refusedAt: trx.refusedAt ?? null,
      contactId: trx.contactId,
      contactName: trx.contactName,
      contactEmail: contactEmailValue,
      offerId: trx.offerId,
      offerName: trx.offerName,
      snapshot: snapshotData,
      items: itemRows.map((item) => ({
        id: item.id,
        itemKind: item.itemKind,
        productId: item.productId ?? null,
        commercialBenefitId: item.commercialBenefitId ?? null,
        quantity: item.quantity,
        resolvedRules: item.resolvedRules as Record<string, unknown>,
        deliveryStatus: item.deliveryStatus,
        responsibleUserId: item.responsibleUserId ?? null,
        createdAt: item.createdAt,
      })),
      statusHistory: historyRows.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus ?? null,
        toStatus: h.toStatus,
        changedBy: h.changedBy ?? null,
        actorSystem: h.actorSystem ?? null,
        reason: h.reason ?? null,
        createdAt: h.createdAt,
      })),
    }

    return detail
  })
}

// ---------------------------------------------------------------------------
// hasActiveRefund — verifica se há refund ativo (requested|approved)
// ---------------------------------------------------------------------------

export async function hasActiveRefund(rawInput: unknown) {
  return toActionResult(async () => {
    await requireSession()
    const { transactionId } = hasActiveRefundSchema.parse(rawInput)

    const rows = await db
      .select({ id: refund.id })
      .from(refund)
      .where(
        and(
          eq(refund.transactionId, transactionId),
          sql`${refund.status} IN ('requested','approved')`,
        ),
      )
      .limit(1)

    return { hasActive: rows.length > 0 }
  })
}

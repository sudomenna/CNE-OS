/**
 * MOD-CONTACT — reclassificação retroativa
 *
 * Recalcula `contact.classification` a partir das transações vigentes do contato,
 * comparando com o valor persistido. Se diverge:
 *   1. UPDATE contact.classification
 *   2. INSERT contact_status_history (sem mudança de status)
 *
 * Usado por:
 *   - Server Action reclassifyAllContactsAction (botão "Atualizar Classificações")
 *   - Backfill pós mudança de BR-CONTACT-CLASSIFICATION
 *
 * Observação: NÃO emite TE-CONTACT-CLASSIFICATION-CHANGED (correção retroativa,
 * não mudança comercial real). Server Action que invoca pode opcionalmente
 * emitir auditoria agregada via audit_log.
 *
 * Specs:
 *   docs/50-business-rules/BR-CONTACT-CLASSIFICATION.md
 *   docs/90-meta/04-decision-log.md ADR-11 (tx: DbTx primeiro arg)
 */

import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { contact, contactStatusHistory } from '@/lib/db/schema/contact'
import {
  classifyContact,
  type ContactClassification,
  type ProductKind,
  type TransactionForClassification,
} from './classify'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReclassificationDetail = {
  contactId: string
  fromClassification: ContactClassification
  toClassification: ContactClassification
}

export type ReclassifyAllResult = {
  total: number
  changed: number
  details: ReclassificationDetail[]
}

// ---------------------------------------------------------------------------
// reclassifyAllContacts
// ---------------------------------------------------------------------------

/**
 * Reclassifica TODOS os contatos vivos (não-mesclados, não soft-deleted).
 * Para cada contato:
 *   - Lê transações + product_kind dos itens
 *   - Chama classifyContact (puro, BR-CONTACT-CLASSIFICATION)
 *   - Se diverge: UPDATE + INSERT history com reason recebido
 *
 * Retorna sumário { total, changed, details }.
 */
export async function reclassifyAllContacts(
  tx: DbTx,
  reason: string,
  actorUserId: string | null = null,
): Promise<ReclassifyAllResult> {
  // Query única: contato + transação + items + product_kind, com soft-delete e merge filtrados.
  // Mantém em memória {contactId → { current, status, transactions[]}} para passar à função pura.
  const rows = await tx.execute<{
    contact_id: string
    current_classification: ContactClassification
    contact_status: 'active' | 'inactive' | 'invalid' | 'blocked'
    transaction_id: string | null
    transaction_status:
      | 'approved'
      | 'refused'
      | 'refunded'
      | 'chargeback'
      | 'cancelled'
      | 'pending'
      | null
    product_kind: ProductKind | null
  }>(sql`
    SELECT
      c.id                           AS contact_id,
      c.classification               AS current_classification,
      c.status                       AS contact_status,
      t.id                           AS transaction_id,
      t.status                       AS transaction_status,
      p.kind                         AS product_kind
    FROM contact c
    LEFT JOIN transaction t        ON t.contact_id     = c.id
    LEFT JOIN transaction_item ti  ON ti.transaction_id = t.id
    LEFT JOIN product p            ON p.id              = ti.product_id
    WHERE c.deleted_at IS NULL
      AND c.merged_into_id IS NULL
  `)

  type Acc = {
    current: ContactClassification
    status: 'active' | 'inactive' | 'invalid' | 'blocked'
    transactions: Map<string, TransactionForClassification>
  }
  const byContact = new Map<string, Acc>()

  for (const r of rows) {
    let entry = byContact.get(r.contact_id)
    if (!entry) {
      entry = {
        current: r.current_classification,
        status: r.contact_status,
        transactions: new Map(),
      }
      byContact.set(r.contact_id, entry)
    }

    if (r.transaction_id && r.transaction_status) {
      let txEntry = entry.transactions.get(r.transaction_id)
      if (!txEntry) {
        txEntry = {
          transactionId: r.transaction_id,
          status: r.transaction_status,
          productKinds: [],
        }
        entry.transactions.set(r.transaction_id, txEntry)
      }
      if (r.product_kind && !txEntry.productKinds.includes(r.product_kind)) {
        txEntry.productKinds.push(r.product_kind)
      }
    }
  }

  const details: ReclassificationDetail[] = []

  for (const [contactId, acc] of byContact) {
    const next = classifyContact(acc.current, [...acc.transactions.values()])
    if (next === acc.current) continue

    // UPDATE classification
    await tx
      .update(contact)
      .set({ classification: next, updatedAt: new Date() })
      .where(eq(contact.id, contactId))

    // INSERT history (sem mudança de status — replicar status atual)
    await tx.insert(contactStatusHistory).values({
      contactId,
      fromStatus: acc.status,
      toStatus: acc.status,
      fromClassification: acc.current,
      toClassification: next,
      changedBy: actorUserId,
      reason,
    })

    details.push({
      contactId,
      fromClassification: acc.current,
      toClassification: next,
    })
  }

  return {
    total: byContact.size,
    changed: details.length,
    details,
  }
}

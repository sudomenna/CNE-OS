/**
 * MOD-FUNNEL — revertFunnelEntryAfterRefund
 *
 * FLOW-07 (Refund E2E) passo 6: reverter oportunidade no funil após aprovação de refund.
 *
 * docs/60-flows/07-refund-end-to-end.md §Aprovação passo 6
 * docs/50-business-rules/BR-REFUND.md §7 passo 6
 *
 * ADR-10: retorna Promise<void> e lança DomainError se necessário
 * ADR-11: tx como primeiro argumento (função muta estado)
 *
 * Zero I/O direto: consome tx para DB e emitTimelineEvent para timeline.
 */
import { and, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { funnelEntry } from '@/lib/db/schema/funnel'
import { emitTimelineEvent } from '@/lib/timeline/emit'

/**
 * Reverte todas as entradas de funil com label='won' vinculadas a uma transação,
 * transitando cada uma para label='reopened' e emitindo TE-OPPORTUNITY-LABEL-CHANGED.
 *
 * FLOW-07 passo 6: chamado dentro da transação SQL de aprovação de refund.
 *
 * Comportamento:
 * 1. SELECT funnel_entry WHERE transaction_id = transactionId AND label = 'won'.
 * 2. Se não encontrar → retorna silenciosamente (oportunidade pode não existir).
 * 3. Para cada entrada encontrada:
 *    a. UPDATE funnel_entry SET label = 'reopened'.
 *    b. Emite TE-OPPORTUNITY-LABEL-CHANGED com payload { entry_id, from: 'won', to: 'reopened' }.
 *
 * @param tx              Transação DB ativa (ADR-11)
 * @param transactionId   UUID da transação que foi reembolsada
 */
export async function revertFunnelEntryAfterRefund(
  tx: DbTx,
  transactionId: string,
): Promise<void> {
  // BR-REFUND §7 passo 6: buscar funnel_entry com transaction_id e label='won'
  // Limit alto (100) como guard — na prática sempre 0 ou 1 entry por transação.
  const wonEntries = await tx
    .select()
    .from(funnelEntry)
    .where(
      and(
        eq(funnelEntry.transactionId, transactionId),
        eq(funnelEntry.label, 'won'),
      ),
    )
    .limit(100)

  // Nenhuma oportunidade vinculada à transação — silencioso (refund sem funil é válido)
  if (wonEntries.length === 0) {
    return
  }

  for (const entry of wonEntries) {
    // BR-REFUND §7 passo 6: label 'won' → 'reopened'
    await tx
      .update(funnelEntry)
      .set({
        label: 'reopened',
        updatedAt: sql`now()`,
      })
      .where(eq(funnelEntry.id, entry.id))

    // TE-OPPORTUNITY-LABEL-CHANGED — payload conforme opportunityLabelChangedSchema
    // docs/30-contracts/03-timeline-event-catalog.md §TE-OPPORTUNITY-LABEL-CHANGED
    await emitTimelineEvent(
      {
        contactId: entry.contactId,
        kind: 'opportunity_label_changed',
        source: 'MOD-FUNNEL',
        actorSystem: 'refund_approve',
        subjectKind: 'funnel_entry',
        subjectId: entry.id,
        payload: {
          entry_id: entry.id,
          from: 'won',
          to: 'reopened',
        },
      },
      tx,
    )
  }
}

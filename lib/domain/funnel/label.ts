/**
 * MOD-FUNNEL — setOpportunityLabel
 *
 * docs/20-domain/08-funnel-opportunity.md §2, §6
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md §6
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { funnelEntry } from '@/lib/db/schema/funnel'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { FunnelEntryNotFoundError } from './errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Labels válidas para funnel_opportunity_label.
 * docs/30-contracts/01-enums.md — funnel_opportunity_label
 * won e lost exigem lógica específica (markWon / markLost) — T-5-11.
 */
export type FunnelOpportunityLabel =
  | 'open'
  | 'negotiating'
  | 'concluded'
  | 'won'
  | 'lost'
  | 'reopened'

export type SetOpportunityLabelInput = {
  /** ID da funnel_entry a atualizar. */
  entryId: string
  /** Label macro a aplicar. */
  label: FunnelOpportunityLabel
  /** Usuário que aplicou a label (null = sistema/automação). */
  actorUserId?: string | null
  /** Sistema que aplicou (para timeline). */
  actorSystem?: string | null
}

// ---------------------------------------------------------------------------
// setOpportunityLabel
// ---------------------------------------------------------------------------

/**
 * Aplica uma etiqueta macro (funnel_opportunity_label) em uma oportunidade.
 *
 * Comportamento (BR-FUNNEL-OPPORTUNITY §6):
 * 1. Carrega funnel_entry pelo entryId.
 * 2. Se não encontrada → lança FunnelEntryNotFoundError.
 * 3. UPDATE funnel_entry.label.
 * 4. Emite TE-OPPORTUNITY-LABEL-CHANGED.
 *
 * NOTA: labels 'won' e 'lost' têm restrições adicionais (INV-FUNNEL-05):
 *   - 'won' exige transaction_id IS NOT NULL (ver markWon em T-5-11).
 *   - 'lost' exige lost_reason IS NOT NULL (ver markLost em T-5-11).
 * Esta função permite a aplicação de qualquer label; a constraint de BD
 * garante a invariante. Para fluxos controlados use markWon / markLost.
 *
 * BR-FUNNEL-OPPORTUNITY §6: etiqueta macro é independente do estágio —
 * setOpportunityLabel não altera current_stage_id.
 *
 * NOTA: não existe tabela funnel_entry_label_history no schema atual.
 * A mudança de label é registrada apenas via evento de timeline.
 * Se auditoria detalhada de label for necessária, abrir OQ para adicionar
 * funnel_entry_label_history (similar ao funnel_entry_stage_history).
 */
export async function setOpportunityLabel(
  tx: DbTx,
  input: SetOpportunityLabelInput,
): Promise<void> {
  const { entryId, label, actorUserId, actorSystem } = input

  // Carregar funnel_entry para validar existência e capturar label anterior.
  const entryRows = await tx
    .select()
    .from(funnelEntry)
    .where(eq(funnelEntry.id, entryId))

  const entry = entryRows[0]
  if (!entry) {
    throw new FunnelEntryNotFoundError(entryId)
  }

  const fromLabel = entry.label

  // UPDATE funnel_entry.label.
  // BR-FUNNEL-OPPORTUNITY §6: a etiqueta macro é independente do estágio.
  await tx
    .update(funnelEntry)
    .set({
      label,
      updatedAt: sql`now()`,
    })
    .where(eq(funnelEntry.id, entryId))

  // TE-OPPORTUNITY-LABEL-CHANGED: emitir após mutação.
  // NOTA: o schema do kind 'opportunity_label_changed' é registrado em T-5-15.
  const actor = actorUserId
    ? { actorUserId, actorSystem: null }
    : { actorUserId: null, actorSystem: actorSystem ?? 'MOD-FUNNEL' }

  await emitTimelineEvent(
    {
      contactId: entry.contactId,
      kind: 'opportunity_label_changed',
      source: 'MOD-FUNNEL',
      ...actor,
      subjectKind: 'funnel_entry',
      subjectId: entryId,
      payload: {
        funnel_id: entry.funnelId,
        funnel_entry_id: entryId,
        from_label: fromLabel,
        to_label: label,
      },
    },
    tx,
  )
}

/**
 * MOD-FUNNEL — moveStage
 *
 * docs/20-domain/08-funnel-opportunity.md §2
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md §5
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  funnelEntry,
  funnelEntryStageHistory,
  funnelStage,
} from '@/lib/db/schema/funnel'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import {
  FunnelEntryNotFoundError,
  FunnelStageMismatchError,
  FunnelEntryTerminalError,
} from './errors'

// ---------------------------------------------------------------------------
// moveStage
// ---------------------------------------------------------------------------

/**
 * Move uma oportunidade de estágio dentro do funil.
 *
 * Comportamento (BR-FUNNEL-OPPORTUNITY §5):
 * 1. Carrega funnel_entry pelo entryId.
 * 2. Se não encontrada → lança FunnelEntryNotFoundError.
 * 3. Se label é 'won' ou 'lost' (terminal) → lança FunnelEntryTerminalError.
 * 4. Carrega funnel_stage pelo toStageId.
 * 5. Se funnel_stage.funnel_id != funnel_entry.funnel_id → lança FunnelStageMismatchError.
 * 6. UPDATE funnel_entry.current_stage_id.
 * 7. INSERT em funnel_entry_stage_history.
 * 8. Emite TE-FUNNEL-STAGE-CHANGED.
 *
 * INV-FUNNEL-03: toda mudança de current_stage_id gera linha em funnel_entry_stage_history.
 * BR-FUNNEL-OPPORTUNITY §6: etiqueta macro é independente do estágio — moveStage não altera label.
 */
export async function moveStage(
  tx: DbTx,
  entryId: string,
  toStageId: string,
  reason?: string,
): Promise<void> {
  // Carregar funnel_entry para validar existência e label.
  const entryRows = await tx
    .select()
    .from(funnelEntry)
    .where(eq(funnelEntry.id, entryId))

  const entry = entryRows[0]
  if (!entry) {
    throw new FunnelEntryNotFoundError(entryId)
  }

  // BR-FUNNEL-OPPORTUNITY: won e lost são labels terminais — moveStage é recusado.
  if (entry.label === 'won' || entry.label === 'lost') {
    throw new FunnelEntryTerminalError(entryId, entry.label)
  }

  // Carregar funnel_stage alvo para validar que pertence ao mesmo funil.
  const stageRows = await tx
    .select()
    .from(funnelStage)
    .where(eq(funnelStage.id, toStageId))

  const targetStage = stageRows[0]

  // Se o estágio não existe ou pertence a funil diferente → mismatch.
  if (!targetStage || targetStage.funnelId !== entry.funnelId) {
    throw new FunnelStageMismatchError(entryId, toStageId, entry.funnelId)
  }

  const fromStageId = entry.currentStageId

  // UPDATE funnel_entry.current_stage_id.
  await tx
    .update(funnelEntry)
    .set({
      currentStageId: toStageId,
      updatedAt: sql`now()`,
    })
    .where(eq(funnelEntry.id, entryId))

  // INV-FUNNEL-03: INSERT em funnel_entry_stage_history (append-only).
  await tx.insert(funnelEntryStageHistory).values({
    funnelEntryId: entryId,
    fromStageId,
    toStageId,
    changedBy: null,
    reason: reason ?? null,
  })

  // TE-FUNNEL-STAGE-CHANGED: emitir após todas as mutações.
  // NOTA: o schema do kind 'funnel_stage_changed' é registrado em T-5-15.
  await emitTimelineEvent(
    {
      contactId: entry.contactId,
      kind: 'funnel_stage_changed',
      source: 'MOD-FUNNEL',
      actorUserId: null,
      actorSystem: 'MOD-FUNNEL',
      subjectKind: 'funnel_entry',
      subjectId: entryId,
      payload: {
        funnel_id: entry.funnelId,
        funnel_entry_id: entryId,
        from_stage_id: fromStageId,
        to_stage_id: toStageId,
        reason: reason ?? null,
      },
    },
    tx,
  )
}

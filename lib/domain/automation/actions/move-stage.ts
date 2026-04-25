/**
 * MOD-AUTOMATION — Action: move_stage (T-11-08)
 *
 * docs/20-domain/15-automation.md §7 Actions
 * ADR-11: tx obrigatório como primeiro argumento
 *
 * Move a oportunidade do contato (subject) para o estágio indicado.
 * Usa a interface pública MOD-FUNNEL.moveStage via entryId resolvido por (contactId, funnelId).
 */
import { and, eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { funnelEntry } from '@/lib/db/schema/funnel'
import { moveStage } from '@/lib/domain/funnel/move-stage'
import type { RunFlowContext } from '../run-flow'
import type { ActionEffect } from './types'

export type MoveStageParams = {
  funnel_id: string
  stage_id: string
}

/**
 * move_stage — atualiza current_stage_id da oportunidade ativa do contato no funil indicado.
 *
 * Pré: ctx.subjectKind === 'contact'; oportunidade ativa deve existir para (contactId, funnelId).
 * Pós: chama MOD-FUNNEL.moveStage (registra histórico + emite TE-FUNNEL-STAGE-CHANGED).
 */
export async function moveStageAction(
  params: MoveStageParams,
  ctx: RunFlowContext,
  tx: DbTx,
): Promise<ActionEffect> {
  const contactId = ctx.subjectId

  // Buscar funnel_entry ativa para (contactId, funnelId)
  const [entry] = await tx
    .select({ id: funnelEntry.id, currentStageId: funnelEntry.currentStageId })
    .from(funnelEntry)
    .where(
      and(
        eq(funnelEntry.contactId, contactId),
        eq(funnelEntry.funnelId, params.funnel_id),
      ),
    )
    .limit(1)

  if (!entry) {
    return {
      ok: false,
      error: `funnel_entry not found for contact ${contactId} in funnel ${params.funnel_id}`,
    }
  }

  const previousStageId = entry.currentStageId

  // Delegar para MOD-FUNNEL.moveStage (registra histórico, emite TE, valida label terminal)
  // Erros de negócio do MOD-FUNNEL (label terminal, stage mismatch) propagam como exceção
  // para que o Inngest faça retry — comportamento documentado em 15-automation.md §9
  await moveStage(tx, entry.id, params.stage_id, 'automation')

  return {
    ok: true,
    output: { previousStageId, newStageId: params.stage_id },
  }
}

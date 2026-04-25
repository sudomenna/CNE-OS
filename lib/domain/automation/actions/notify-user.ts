/**
 * MOD-AUTOMATION — Action: notify_user (T-11-08)
 *
 * docs/20-domain/15-automation.md §7 Actions
 * ADR-11: tx obrigatório como primeiro argumento
 *
 * Fase 1: insere timeline event TE-USER-NOTIFICATION no contato subject
 * com o conteúdo da mensagem e o user_id destino.
 * Fase 2 enviará push/email real.
 */
import type { DbTx } from '@/lib/db/client'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { RunFlowContext } from '../run-flow'
import type { ActionEffect } from './types'

export type NotifyUserParams = {
  user_id: string
  message: string
}

/**
 * notify_user — Fase 1: emite TE-USER-NOTIFICATION como timeline event no contato subject.
 *
 * Pós: insere linha em timeline_event com kind='user_notification'.
 * Retorna { ok: true, output: { notified: true } }.
 */
export async function notifyUser(
  params: NotifyUserParams,
  ctx: RunFlowContext,
  tx: DbTx,
): Promise<ActionEffect> {
  const contactId = ctx.subjectId

  // flowId e executionId enriquecidos se disponíveis no contexto
  const flowId = ctx.subject.flowId as string | undefined
  const executionId = ctx.subject.executionId as string | undefined

  // Emitir TE-USER-NOTIFICATION (Fase 1 — Fase 2 enviará canal real)
  await emitTimelineEvent(
    {
      contactId,
      kind: 'user_notification',
      source: 'MOD-AUTOMATION',
      actorSystem: 'MOD-AUTOMATION',
      subjectKind: ctx.subjectKind,
      subjectId: contactId,
      payload: {
        user_id: params.user_id,
        message: params.message,
        flow_id: flowId,
        execution_id: executionId,
      },
    },
    tx,
  )

  return { ok: true, output: { notified: true } }
}

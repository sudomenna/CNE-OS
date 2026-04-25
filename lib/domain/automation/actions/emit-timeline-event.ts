/**
 * MOD-AUTOMATION — Action: emit_timeline_event (T-11-08)
 *
 * docs/20-domain/15-automation.md §7 Actions, §11
 * ADR-11: tx obrigatório como primeiro argumento
 *
 * Emite um timeline event de kind configurável via params.event_kind.
 * Usa a interface pública MOD-TIMELINE.emitTimelineEvent.
 */
import type { DbTx } from '@/lib/db/client'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { RunFlowContext } from '../run-flow'
import type { ActionEffect } from './types'

export type EmitTimelineEventParams = {
  event_kind: string
  body?: Record<string, unknown>
}

/**
 * emit_timeline_event — emite um timeline event customizável para o subject do fluxo.
 *
 * Pré: params.event_kind deve ser um kind registrado no KIND_REGISTRY de MOD-TIMELINE.
 *      Se o kind não estiver registrado, UnknownTimelineKindError é lançado e capturado
 *      como { ok: false, error } para evitar retry desnecessário.
 *
 * Pós: insere linha em timeline_event; retorna { ok: true, output: { eventId } }.
 */
export async function emitTimelineEventAction(
  params: EmitTimelineEventParams,
  ctx: RunFlowContext,
  tx: DbTx,
): Promise<ActionEffect> {
  const contactId = ctx.subjectId

  // flowId e executionId enriquecidos se disponíveis no contexto de execução
  const flowId = ctx.subject.flowId as string | undefined
  const executionId = ctx.subject.executionId as string | undefined

  try {
    const event = await emitTimelineEvent(
      {
        contactId,
        kind: params.event_kind,
        source: 'MOD-AUTOMATION',
        actorSystem: 'MOD-AUTOMATION',
        subjectKind: ctx.subjectKind,
        subjectId: ctx.subjectId,
        payload: {
          ...(params.body ?? {}),
          flow_id: flowId,
          execution_id: executionId,
        },
      },
      tx,
    )

    return { ok: true, output: { eventId: event.id } }
  } catch (err: unknown) {
    // UnknownTimelineKindError e TimelinePayloadError são erros de configuração,
    // não erros transitórios — retornar ok=false para não fazer retry infinito
    const message = err instanceof Error ? err.message : String(err)
    if (
      message.includes('unknown timeline kind') ||
      message.includes('timeline payload') ||
      message.includes('UnknownTimelineKindError') ||
      message.includes('TimelinePayloadError')
    ) {
      return { ok: false, error: message }
    }
    // Outros erros (DB, etc.) propagam para Inngest retry
    throw err
  }
}

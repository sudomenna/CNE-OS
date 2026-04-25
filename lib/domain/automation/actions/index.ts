/**
 * MOD-AUTOMATION — Dispatcher central de actions (T-11-08)
 *
 * docs/20-domain/15-automation.md §7 Actions
 * ADR-10: retorna Promise<ActionEffect> — erros controlados como { ok: false, error }
 * ADR-11: tx: DbTx como argumento (passado para cada action)
 *
 * executeAction — valida params com schema Zod correspondente e despacha para a
 * função de action correta. Kind desconhecido retorna { ok: false, error }.
 *
 * Consumidor: run-flow.ts (ActionHandler injetado em RunFlowOptions)
 */
import type { DbTx } from '@/lib/db/client'
import { actionParamsSchema } from '../schemas/action'
import type { RunFlowContext } from '../run-flow'
import type { ActionEffect } from './types'
import { applyTag } from './apply-tag'
import { moveStageAction } from './move-stage'
import { openTicketAction } from './open-ticket'
import type { OpenTicketParams } from './open-ticket'
import { notifyUser } from './notify-user'
import { emitTimelineEventAction } from './emit-timeline-event'
import type { EmitTimelineEventParams } from './emit-timeline-event'
import { sendExternal } from './send-external'
import type { SendExternalParams } from './send-external'

// Re-exports para consumo externo
export type { ActionEffect } from './types'

/**
 * executeAction — ponto de entrada único para execução de qualquer action.
 *
 * 1. Valida params com o schema Zod discriminado por kind (INV-AUTOMATION-04).
 * 2. Despacha para a função de action correspondente.
 * 3. Kind desconhecido → { ok: false, error: 'unknown action kind' }.
 * 4. Erro de validação Zod → { ok: false, error: <mensagem> }.
 */
export async function executeAction(
  kind: string,
  params: unknown,
  ctx: RunFlowContext,
  tx: DbTx,
): Promise<ActionEffect> {
  // INV-AUTOMATION-04: validar params com schema antes de executar
  // Injeta kind no objeto para o discriminatedUnion funcionar
  const rawWithKind = typeof params === 'object' && params !== null
    ? { kind, ...params }
    : { kind }

  const parsed = actionParamsSchema.safeParse(rawWithKind)
  if (!parsed.success) {
    return { ok: false, error: `invalid params for action ${kind}: ${parsed.error.message}` }
  }

  const validParams = parsed.data

  switch (validParams.kind) {
    case 'apply_tag':
      return applyTag({ tag: validParams.tag }, ctx, tx)

    case 'move_stage':
      return moveStageAction(
        { funnel_id: validParams.funnel_id, stage_id: validParams.stage_id },
        ctx,
        tx,
      )

    case 'open_ticket': {
      const openParams: OpenTicketParams = validParams.category
        ? { title: validParams.title, category: validParams.category }
        : { title: validParams.title }
      return openTicketAction(openParams, ctx, tx)
    }

    case 'notify_user':
      return notifyUser(
        { user_id: validParams.user_id, message: validParams.message },
        ctx,
        tx,
      )

    case 'emit_timeline_event': {
      const emitParams: EmitTimelineEventParams = validParams.body
        ? { event_kind: validParams.event_kind, body: validParams.body }
        : { event_kind: validParams.event_kind }
      return emitTimelineEventAction(emitParams, ctx, tx)
    }

    case 'send_external': {
      const sendParams: SendExternalParams = { url: validParams.url }
      if (validParams.method) sendParams.method = validParams.method
      if (validParams.payload) sendParams.payload = validParams.payload
      return sendExternal(sendParams, ctx, tx)
    }

    default: {
      // TypeScript narrowing: este ponto só é alcançado se o kind não está no schema
      const _exhaustive: never = validParams
      void _exhaustive
      return { ok: false, error: 'unknown action kind' }
    }
  }
}

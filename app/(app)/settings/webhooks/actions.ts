'use server'

/**
 * MOD-INTEGRATIONS / T-8-17 — Server Actions para /settings/webhooks
 *
 * Fluxo: FLOW-12 (Reprocessamento manual de webhook DLQ)
 * Spec: docs/40-integrations/01-digital-guru.md §Idempotência/retry/DLQ
 *       docs/60-flows/12-webhook-reprocess.md
 *       docs/30-contracts/05-api-server-actions.md
 */

import { z } from 'zod'
import { eq, and, desc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult, ActionError } from '@/lib/actions/result'
import { inngest } from '@/inngest/client'
import type { ActionResult } from '@/lib/actions/result'
import type { WebhookLog } from '@/lib/db/schema/webhook-log'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const getWebhookLogsSchema = z.object({
  status: z
    .enum(['received', 'processed', 'failed', 'dead_letter'])
    .optional(),
  provider: z
    .enum([
      'digital_guru',
      'brevo',
      'whatsapp_official',
      'instagram',
      'email',
      'notazz',
      'analytics',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const getWebhookLogSchema = z.object({
  id: z.string().uuid(),
})

const reprocessWebhookSchema = z.object({
  id: z.string().uuid(),
})

const ignoreWebhookSchema = z.object({
  id: z.string().uuid(),
  note: z.string().min(1, 'Nota é obrigatória').max(1000),
})

const addOperatorNoteSchema = z.object({
  id: z.string().uuid(),
  note: z.string().min(1, 'Nota é obrigatória').max(1000),
})

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

/** Entrada append-only de nota de operador em webhook_log.operator_notes */
export type OperatorNote = {
  addedAt: string  // ISO 8601
  addedBy: string  // user uuid
  text: string
}

export type WebhookLogListItem = Pick<
  WebhookLog,
  | 'id'
  | 'provider'
  | 'eventKind'
  | 'status'
  | 'receivedAt'
  | 'processedAt'
  | 'deadLetteredAt'
  | 'attempts'
  | 'lastError'
  | 'externalEventId'
>

export type WebhookLogDetail = WebhookLog

export type WebhookLogListResult = {
  items: WebhookLogListItem[]
  total: number
  page: number
  pageSize: number
}

// ---------------------------------------------------------------------------
// getWebhookLogs — lista paginada com filtros
// Leitura — sem audit (BR-AUDIT §3)
// ---------------------------------------------------------------------------

export async function getWebhookLogs(
  rawInput: unknown,
): Promise<ActionResult<WebhookLogListResult>> {
  return toActionResult(async () => {
    await requireSession()

    const input = getWebhookLogsSchema.parse(rawInput)
    const offset = (input.page - 1) * input.pageSize

    const conditions = []
    if (input.status !== undefined) {
      conditions.push(eq(webhookLog.status, input.status))
    }
    if (input.provider !== undefined) {
      conditions.push(eq(webhookLog.provider, input.provider))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [items, countRows] = await Promise.all([
      db
        .select({
          id: webhookLog.id,
          provider: webhookLog.provider,
          eventKind: webhookLog.eventKind,
          status: webhookLog.status,
          receivedAt: webhookLog.receivedAt,
          processedAt: webhookLog.processedAt,
          deadLetteredAt: webhookLog.deadLetteredAt,
          attempts: webhookLog.attempts,
          lastError: webhookLog.lastError,
          externalEventId: webhookLog.externalEventId,
        })
        .from(webhookLog)
        .where(where)
        .orderBy(desc(webhookLog.receivedAt))
        .limit(input.pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(webhookLog)
        .where(where),
    ])

    return {
      items,
      total: countRows[0]?.count ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    }
  })
}

// ---------------------------------------------------------------------------
// getWebhookLog — detalhe de um webhook_log
// Leitura — sem audit (BR-AUDIT §3)
// ---------------------------------------------------------------------------

export async function getWebhookLog(
  rawInput: unknown,
): Promise<ActionResult<WebhookLogDetail>> {
  return toActionResult(async () => {
    await requireSession()

    const { id } = getWebhookLogSchema.parse(rawInput)

    const rows = await db
      .select()
      .from(webhookLog)
      .where(eq(webhookLog.id, id))
      .limit(1)

    const entry = rows[0]
    if (!entry) {
      throw new ActionError('NOT_FOUND', `webhook_log ${id} não encontrado`)
    }

    return entry
  })
}

// ---------------------------------------------------------------------------
// reprocessWebhook — re-enfileira no Inngest, atualiza status para 'received'
// Guard: webhook.reprocess (admin|financial + 2FA) — FLOW-12 §5 passo 1
// ---------------------------------------------------------------------------

export async function reprocessWebhook(
  rawInput: unknown,
): Promise<ActionResult<{ webhookLogId: string }>> {
  return toActionResult(async () => {
    const ctx = await requireSession()

    // BR-RBAC: reprocess pode disparar venda/entitlement — exige admin|financial + 2FA
    // FLOW-12 §pré-condições
    await requirePermission(ctx, 'webhook.reprocess', { kind: 'global' })

    const { id } = reprocessWebhookSchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      // FLOW-12 §E-04: lock para evitar corrida entre dois operadores simultâneos
      const rows = await tx
        .select({
          id: webhookLog.id,
          status: webhookLog.status,
          provider: webhookLog.provider,
          externalEventId: webhookLog.externalEventId,
        })
        .from(webhookLog)
        .where(eq(webhookLog.id, id))
        .for('update')
        .limit(1)

      const entry = rows[0]
      if (!entry) {
        throw new ActionError('NOT_FOUND', `webhook_log ${id} não encontrado`)
      }

      // FLOW-12 §E-01: apenas failed ou dead_letter podem ser reprocessados
      if (entry.status !== 'failed' && entry.status !== 'dead_letter') {
        throw new ActionError(
          'VALIDATION',
          `Não é possível reprocessar webhook com status '${entry.status}'. Apenas 'failed' ou 'dead_letter' são permitidos.`,
          { rule: 'FLOW-12' },
        )
      }

      // FLOW-12 §5.2: reset do status para 'received', zera attempts e lastError
      await tx
        .update(webhookLog)
        .set({
          status: 'received',
          attempts: 0,
          lastError: null,
        })
        .where(eq(webhookLog.id, id))

      // BR-AUDIT §3: auditoria dentro da mesma transação
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'other',
        resourceKind: 'webhook_log',
        resourceId: id,
        before: { status: entry.status },
        after: { status: 'received', attempts: 0 },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: {
          correlationId: ctx.correlationId,
          provider: entry.provider,
          externalEventId: entry.externalEventId,
          flow: 'FLOW-12',
        },
      })

      return { id, provider: entry.provider }
    })

    // FLOW-12 §5.4: enfileirar no Inngest fora da transação SQL (efeito externo)
    await inngest.send({
      name: 'digital-guru/webhook.received',
      data: {
        webhookLogId: result.id,
        correlationId: ctx.correlationId,
      },
    })

    // TODO: emitir TE-WEBHOOK-REPROCESSED quando kind estiver registrado no KIND_REGISTRY
    // (kind 'webhook_reprocessed' não existe no registro — FLOW-12 §5.3)

    revalidatePath('/settings/webhooks')
    revalidatePath(`/settings/webhooks/${id}`)

    return { webhookLogId: result.id }
  })
}

// ---------------------------------------------------------------------------
// ignoreWebhookAction — marca webhook como processado sem executar (FLOW-12 §7)
// Guard: webhook.reprocess (admin|financial + 2FA) — mesma permissão de reprocess
// ---------------------------------------------------------------------------

export async function ignoreWebhookAction(
  id: string,
  note: string,
): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const ctx = await requireSession()

    // BR-RBAC: ignore também pode suprimir venda — exige admin|financial + 2FA
    await requirePermission(ctx, 'webhook.reprocess', { kind: 'global' })

    // Validar input
    ignoreWebhookSchema.parse({ id, note })

    await db.transaction(async (tx) => {
      // FLOW-12 §E-04: lock para evitar corrida entre operadores simultâneos
      const rows = await tx
        .select({
          id: webhookLog.id,
          status: webhookLog.status,
          provider: webhookLog.provider,
          externalEventId: webhookLog.externalEventId,
          operatorNotes: webhookLog.operatorNotes,
        })
        .from(webhookLog)
        .where(eq(webhookLog.id, id))
        .for('update')
        .limit(1)

      const entry = rows[0]
      if (!entry) {
        throw new ActionError('NOT_FOUND', `webhook_log ${id} não encontrado`)
      }

      // FLOW-12 §E-01: apenas failed ou dead_letter podem ser ignorados
      if (entry.status !== 'failed' && entry.status !== 'dead_letter') {
        throw new ActionError(
          'VALIDATION',
          `Não é possível ignorar webhook com status '${entry.status}'. Apenas 'failed' ou 'dead_letter' são permitidos.`,
          { rule: 'FLOW-12' },
        )
      }

      // Append nota ao array operator_notes (imutável — FLOW-12 §3)
      const newNote: OperatorNote = {
        addedAt: new Date().toISOString(),
        addedBy: ctx.user.id,
        text: note,
      }
      const existingNotes = (entry.operatorNotes as OperatorNote[] | null) ?? []
      const updatedNotes: OperatorNote[] = [...existingNotes, newNote]

      // FLOW-12 §7: UPDATE status para 'processed' e append nota
      await tx
        .update(webhookLog)
        .set({
          status: 'processed',
          processedAt: new Date(),
          operatorNotes: updatedNotes,
        })
        .where(eq(webhookLog.id, id))

      // BR-AUDIT §3: registrar ação crítica dentro da mesma transação
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'other',
        resourceKind: 'webhook_log',
        resourceId: id,
        before: { status: entry.status },
        after: { status: 'processed', reason: 'ignored_by_operator' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: {
          correlationId: ctx.correlationId,
          provider: entry.provider,
          externalEventId: entry.externalEventId,
          flow: 'FLOW-12',
          action: 'ignore',
        },
      })

      // TODO: emitir TE-INTEGRATION-EVENT com payload.reason='ignored_by_operator'
      // quando kind 'integration_event' estiver registrado no KIND_REGISTRY
      // FLOW-12 §7 — sem contactId vinculável neste passo (OQ-FLOW-12-03)
    })

    revalidatePath('/settings/webhooks')
    revalidatePath(`/settings/webhooks/${id}`)
  })
}

// ---------------------------------------------------------------------------
// addOperatorNoteAction — append nota sem mudar status (FLOW-12 §3)
// Guard: webhook.reprocess
// ---------------------------------------------------------------------------

export async function addOperatorNoteAction(
  id: string,
  note: string,
): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const ctx = await requireSession()

    // BR-RBAC: operação sensível — exige admin|financial + 2FA
    await requirePermission(ctx, 'webhook.reprocess', { kind: 'global' })

    // Validar input
    addOperatorNoteSchema.parse({ id, note })

    await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: webhookLog.id,
          operatorNotes: webhookLog.operatorNotes,
        })
        .from(webhookLog)
        .where(eq(webhookLog.id, id))
        .for('update')
        .limit(1)

      const entry = rows[0]
      if (!entry) {
        throw new ActionError('NOT_FOUND', `webhook_log ${id} não encontrado`)
      }

      const newNote: OperatorNote = {
        addedAt: new Date().toISOString(),
        addedBy: ctx.user.id,
        text: note,
      }
      const existingNotes = (entry.operatorNotes as OperatorNote[] | null) ?? []
      const updatedNotes: OperatorNote[] = [...existingNotes, newNote]

      await tx
        .update(webhookLog)
        .set({ operatorNotes: updatedNotes })
        .where(eq(webhookLog.id, id))

      // BR-AUDIT §3: adicionar nota é ação auditável (BR-AUDIT)
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'other',
        resourceKind: 'webhook_log',
        resourceId: id,
        after: { note_added: true },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: {
          correlationId: ctx.correlationId,
          flow: 'FLOW-12',
          action: 'add_operator_note',
        },
      })
    })

    revalidatePath(`/settings/webhooks/${id}`)
  })
}

'use server'

/**
 * MOD-TICKET — Server Actions
 *
 * docs/20-domain/06-ticket.md
 * docs/30-contracts/05-api-server-actions.md
 * docs/30-contracts/07-module-interfaces.md §MOD-TICKET
 *
 * ADR-10: Every action wraps in toActionResult
 * RBAC: requireSession() + requirePermission() on every public action
 * Zod: validates input before calling domain
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { toActionResult } from '@/lib/actions/result'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { openTicket } from '@/lib/domain/ticket/open'
import { setTicketStatus } from '@/lib/domain/ticket/set-status'
import { assignTicket } from '@/lib/domain/ticket/assign'
import { addTicketNote } from '@/lib/domain/ticket/add-note'
import { updateTicket } from '@/lib/domain/ticket/update'
import { timelineEvent } from '@/lib/db/schema/timeline'
import { userAccount } from '@/lib/db/schema/organization'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ticketCategoryValues = [
  'commercial',
  'support',
  'financial',
  'cancellation',
  'refund',
  'access',
  'registration',
  'other',
] as const

const ticketPriorityValues = ['low', 'medium', 'high', 'urgent'] as const

const ticketStatusValues = [
  'open',
  'in_progress',
  'waiting_reply',
  'resolved',
  'cancelled',
] as const

const openTicketSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  brandId: z.string().uuid('brandId deve ser UUID'),
  category: z.enum(ticketCategoryValues),
  priority: z.enum(ticketPriorityValues).default('medium'),
  title: z.string().min(1, 'Titulo e obrigatorio').max(255),
  description: z.string().optional(),
  originConversationId: z.string().uuid().optional(),
})

const changeTicketStatusSchema = z.object({
  ticketId: z.string().uuid('ticketId deve ser UUID'),
  toStatus: z.enum(ticketStatusValues),
  reason: z.string().optional(),
})

const assignTicketSchema = z.object({
  ticketId: z.string().uuid('ticketId deve ser UUID'),
  toUserId: z.string().uuid('toUserId deve ser UUID'),
})

const addTicketNoteSchema = z.object({
  ticketId: z.string().uuid('ticketId deve ser UUID'),
  body: z.string().min(1, 'Corpo da nota nao pode ser vazio'),
  isInternal: z.boolean().default(true),
})

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * openTicketAction — cria novo ticket.
 * Guard: ticket.open
 */
export async function openTicketAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: ticket.open disponivel para todos os papeis de atendimento
    await requirePermission(ctx, 'ticket.open', { kind: 'global' })

    const input = openTicketSchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      return openTicket(tx, {
        contactId: input.contactId,
        brandId: input.brandId,
        category: input.category,
        priority: input.priority,
        title: input.title,
        description: input.description ?? null,
        openedByUserId: ctx.user.id,
        originConversationId: input.originConversationId ?? null,
      })
    })

    revalidatePath('/tickets')

    return { ticketId: result.id, ticketNumber: result.number }
  })
}

/**
 * changeTicketStatusAction — muda status do ticket.
 * Guard: ticket.open (para transicoes gerais) ou ticket.cancel (para cancelamento)
 */
export async function changeTicketStatusAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()

    const input = changeTicketStatusSchema.parse(rawInput)

    // BR-RBAC: cancelamento requer permissao especifica; demais transicoes usam ticket.open
    if (input.toStatus === 'cancelled') {
      await requirePermission(ctx, 'ticket.cancel', { kind: 'ticket', id: input.ticketId })
    } else {
      await requirePermission(ctx, 'ticket.open', { kind: 'ticket', id: input.ticketId })
    }

    await db.transaction(async (tx) => {
      await setTicketStatus(tx, input.ticketId, input.toStatus, ctx.user.id, input.reason)
    })

    revalidatePath('/tickets')
    revalidatePath(`/tickets/${input.ticketId}`)
  })
}

/**
 * assignTicketAction — atribui ticket a um usuario.
 * Guard: ticket.open
 */
export async function assignTicketAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'ticket.open', { kind: 'global' })

    const input = assignTicketSchema.parse(rawInput)

    await db.transaction(async (tx) => {
      await assignTicket(tx, input.ticketId, input.toUserId, ctx.user.id)
    })

    revalidatePath('/tickets')
    revalidatePath(`/tickets/${input.ticketId}`)
  })
}

/**
 * assignTicketToMeAction — atribui ticket ao usuario da sessao.
 * Guard: ticket.open
 */
export async function assignTicketToMeAction(ticketId: string) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'ticket.open', { kind: 'global' })

    const parsed = z.string().uuid().parse(ticketId)

    await db.transaction(async (tx) => {
      await assignTicket(tx, parsed, ctx.user.id, ctx.user.id)
    })

    revalidatePath('/tickets')
    revalidatePath(`/tickets/${parsed}`)
  })
}

/**
 * addTicketNoteAction — adiciona nota ao ticket.
 * Guard: ticket.open
 */
export async function addTicketNoteAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'ticket.open', { kind: 'global' })

    const input = addTicketNoteSchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      return addTicketNote(tx, input.ticketId, ctx.user.id, input.body, input.isInternal)
    })

    revalidatePath(`/tickets/${input.ticketId}`)

    return { noteId: result.id }
  })
}

// ---------------------------------------------------------------------------
// Zod schemas — new actions (T-12-30)
// ---------------------------------------------------------------------------

const updateTicketFieldSchema = z.object({
  id: z.string().uuid('id deve ser UUID'),
  field: z.enum(['title', 'description', 'category', 'priority']),
  value: z.string(),
})

const getTicketTimelineSchema = z.string().uuid('ticketId deve ser UUID')

// ---------------------------------------------------------------------------
// New Server Actions (T-12-30)
// ---------------------------------------------------------------------------

/**
 * updateTicketAction — atualiza campo individual do ticket (inline edit).
 * Guard: ticket.open
 */
export async function updateTicketAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'ticket.open', { kind: 'global' })

    const input = updateTicketFieldSchema.parse(rawInput)

    // Build the UpdateTicketInput by field
    const patch: import('@/lib/domain/ticket/update').UpdateTicketInput = {
      actorUserId: ctx.user.id,
    }

    if (input.field === 'title') {
      const trimmed = input.value.trim()
      if (!trimmed) throw new Error('Titulo nao pode ser vazio')
      patch.title = trimmed
    } else if (input.field === 'description') {
      patch.description = input.value || null
    } else if (input.field === 'category') {
      const validCategories = z.enum([
        'commercial', 'support', 'financial', 'cancellation',
        'refund', 'access', 'registration', 'other',
      ])
      patch.category = validCategories.parse(input.value)
    } else if (input.field === 'priority') {
      const validPriorities = z.enum(['low', 'medium', 'high', 'urgent'])
      patch.priority = validPriorities.parse(input.value)
    }

    await db.transaction(async (tx) => {
      await updateTicket(tx, input.id, patch)
    })

    revalidatePath(`/tickets/${input.id}`)
    revalidatePath('/tickets')
  })
}

/**
 * getTicketTimeline — retorna eventos de timeline associados ao ticket.
 * Guard: ticket.open (leitura)
 *
 * Usa subjectKind='ticket' AND subjectId=ticketId diretamente na timeline_event.
 */
export async function getTicketTimeline(rawTicketId: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'ticket.open', { kind: 'global' })

    const ticketId = getTicketTimelineSchema.parse(rawTicketId)

    const events = await db
      .select({
        id: timelineEvent.id,
        kind: timelineEvent.kind,
        source: timelineEvent.source,
        actorUserId: timelineEvent.actorUserId,
        actorSystem: timelineEvent.actorSystem,
        payload: timelineEvent.payload,
        occurredAt: timelineEvent.occurredAt,
      })
      .from(timelineEvent)
      .where(
        and(
          eq(timelineEvent.subjectKind, 'ticket'),
          eq(timelineEvent.subjectId, ticketId),
        ),
      )
      .orderBy(desc(timelineEvent.occurredAt))
      .limit(100)

    return events
  })
}

/**
 * listUsersAction — retorna usuários ativos atribuíveis a tickets.
 * Guard: ticket.open
 */
export async function listUsersAction() {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'ticket.open', { kind: 'global' })

    const users = await db
      .select({
        id: userAccount.id,
        name: userAccount.fullName,
        email: userAccount.email,
      })
      .from(userAccount)
      .where(
        and(
          eq(userAccount.isActive, true),
          isNull(userAccount.deletedAt),
        ),
      )
      .orderBy(userAccount.fullName)

    return users
  })
}

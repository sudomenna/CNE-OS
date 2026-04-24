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
import { openTicket } from '@/lib/domain/ticket/open'
import { setTicketStatus } from '@/lib/domain/ticket/set-status'
import { assignTicket } from '@/lib/domain/ticket/assign'
import { addTicketNote } from '@/lib/domain/ticket/add-note'

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

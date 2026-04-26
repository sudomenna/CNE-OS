'use server'

/**
 * Server Actions específicas para a página de detalhe do contato.
 * Wraps as funções de domínio do contato para a UI de detalhe.
 *
 * T-12-16 — Contact: Header rico + wiring das 8 tabs
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { contact, contactTag, contactStatusHistory } from '@/lib/db/schema/contact'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { toActionResult } from '@/lib/actions/result'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { ActionError } from '@/lib/actions/errors'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const addTagSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  tag: z
    .string()
    .min(1, 'Tag não pode ser vazia')
    .transform((s) => s.toLowerCase().trim().replace(/\s+/g, '-')),
})

const removeTagSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  tag: z.string().min(1, 'Tag não pode ser vazia'),
})

const blacklistSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  reason: z.string().optional(),
})

// ---------------------------------------------------------------------------
// addTagAction
// ---------------------------------------------------------------------------

/**
 * Adiciona tag a um contato (idempotente).
 * Guard: contact.write
 */
export async function addTagAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = addTagSchema.parse(rawInput)

    await db.transaction(async (tx) => {
      await tx
        .insert(contactTag)
        .values({
          contactId: input.contactId,
          tag: input.tag,
          source: 'manual',
          appliedBy: ctx.user.id,
        })
        .onConflictDoNothing()

      await emitTimelineEvent(
        {
          contactId: input.contactId,
          kind: 'contact_tag_added',
          source: 'MOD-CONTACT',
          actorUserId: ctx.user.id,
          payload: { tag: input.tag, source: 'manual' },
        },
        tx,
      )
    })

    revalidatePath(`/contacts/${input.contactId}`)
    return { tag: input.tag }
  })
}

// ---------------------------------------------------------------------------
// removeTagAction
// ---------------------------------------------------------------------------

/**
 * Remove tag de um contato.
 * Guard: contact.write
 */
export async function removeTagAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = removeTagSchema.parse(rawInput)

    await db.transaction(async (tx) => {
      await tx
        .delete(contactTag)
        .where(
          and(
            eq(contactTag.contactId, input.contactId),
            eq(contactTag.tag, input.tag),
          ),
        )

      await emitTimelineEvent(
        {
          contactId: input.contactId,
          kind: 'contact_tag_removed',
          source: 'MOD-CONTACT',
          actorUserId: ctx.user.id,
          payload: { tag: input.tag },
        },
        tx,
      )
    })

    revalidatePath(`/contacts/${input.contactId}`)
    return { tag: input.tag }
  })
}

// ---------------------------------------------------------------------------
// blacklistContactAction
// ---------------------------------------------------------------------------

/**
 * Adiciona contato à blacklist (status → blocked).
 * Guard: contact.write + role admin
 */
export async function blacklistContactAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    // BR-RBAC: apenas admin pode bloquear
    if (ctx.user.role !== 'admin') {
      throw new ActionError('FORBIDDEN', 'only admin can blacklist contacts')
    }

    const input = blacklistSchema.parse(rawInput)

    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: contact.id, status: contact.status, mergedIntoId: contact.mergedIntoId })
        .from(contact)
        .where(and(eq(contact.id, input.contactId), isNull(contact.deletedAt)))
        .limit(1)

      const current = rows[0]
      if (!current) {
        throw new ActionError('NOT_FOUND', `contact ${input.contactId} not found`)
      }

      // BR-MERGE: contato mesclado é imutável
      if (current.mergedIntoId !== null) {
        throw new ActionError('FORBIDDEN', 'merged contact is immutable', { rule: 'BR-MERGE' })
      }

      const fromStatus = current.status

      await tx
        .update(contact)
        .set({ status: 'blocked', updatedAt: new Date() })
        .where(eq(contact.id, input.contactId))

      await tx.insert(contactStatusHistory).values({
        contactId: input.contactId,
        fromStatus,
        toStatus: 'blocked',
        changedBy: ctx.user.id,
        reason: input.reason ?? null,
      })

      await emitTimelineEvent(
        {
          contactId: input.contactId,
          kind: 'contact_blacklisted',
          source: 'MOD-CONTACT',
          actorUserId: ctx.user.id,
          payload: { from_status: fromStatus, reason: input.reason },
        },
        tx,
      )
    })

    revalidatePath(`/contacts/${input.contactId}`)
    return { contactId: input.contactId }
  })
}

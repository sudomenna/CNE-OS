'use server'

import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import {
  contact,
  contactPhone,
  contactEmail,
  contactTag,
  contactNote,
  contactStatusHistory,
} from '@/lib/db/schema/contact'
import { resolveContactIdentity } from '@/lib/domain/contact/resolve-identity'
import type { ContactIssueDraft } from '@/lib/domain/contact/resolve-identity'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { ActionError } from '@/lib/actions/errors'


// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const upsertContactSchema = z.object({
  fullName: z.string().min(1, 'Nome é obrigatório'),
  cpf: z.string().optional(),
  phoneE164: z.string().optional(),
  email: z.string().optional(),
  origin: z
    .enum(['checkout', 'message', 'import', 'manual', 'integration'])
    .default('manual'),
  sourceRef: z.string().optional(),
})

const addTagSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  tag: z
    .string()
    .min(1, 'Tag não pode ser vazia')
    .transform((s) => s.toLowerCase().trim().replace(/\s+/g, '-')),
  source: z.enum(['manual', 'benefit', 'automation']).default('manual'),
})

const removeTagSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  tag: z.string().min(1, 'Tag não pode ser vazia'),
})

const changeStatusSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  toStatus: z.enum(['active', 'inactive', 'invalid', 'blocked']),
  reason: z.string().optional(),
})

const addNoteSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  body: z.string().min(1, 'Corpo da nota não pode ser vazio'),
  pinned: z.boolean().default(false),
})

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * upsertContact — resolve identidade e cria ou atualiza contato.
 * Guard: contact.write
 */
export async function upsertContact(rawInput: unknown): Promise<ReturnType<typeof toActionResult<{
  contactId: string
  action: 'create' | 'update' | 'noop'
  issues: ContactIssueDraft[]
}>>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = upsertContactSchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      const resolution = await resolveContactIdentity(
        {
          fullName: input.fullName,
          cpf: input.cpf ?? null,
          phoneE164: input.phoneE164 ?? null,
          email: input.email ?? null,
          origin: input.origin,
          ...(input.sourceRef !== undefined ? { sourceRef: input.sourceRef } : {}),
        },
        tx,
      )

      if (resolution.action === 'noop') {
        return {
          contactId: resolution.contactId,
          action: 'noop' as const,
          issues: resolution.issues,
        }
      }

      if (resolution.action === 'create') {
        const [created] = await tx
          .insert(contact)
          .values({
            fullName: input.fullName,
            cpf: input.cpf ?? null,
            origin: input.origin,
          })
          .returning()

        const contactId = created!.id

        if (input.phoneE164) {
          await tx.insert(contactPhone).values({
            contactId,
            e164: input.phoneE164,
            status: 'primary',
          })
        }

        if (input.email) {
          await tx.insert(contactEmail).values({
            contactId,
            email: input.email.toLowerCase().trim(),
            status: 'primary',
          })
        }

        await emitTimelineEvent(
          {
            contactId,
            kind: 'contact_created',
            source: 'MOD-CONTACT',
            actorUserId: ctx.user.id,
            payload: {
              origin: input.origin,
              source_ref: input.sourceRef,
            },
          },
          tx,
        )

        return {
          contactId,
          action: 'create' as const,
          issues: resolution.issues,
        }
      }

      // action === 'update'
      const contactId = resolution.contactId

      for (const change of resolution.applied) {
        if (change.field === 'add_alternative_email' && input.email) {
          await tx.insert(contactEmail).values({
            contactId,
            email: input.email.toLowerCase().trim(),
            status: 'alternative',
          }).onConflictDoNothing()
        } else if (change.field === 'promote_new_primary_phone' && input.phoneE164) {
          await tx.insert(contactPhone).values({
            contactId,
            e164: input.phoneE164,
            status: 'secondary',
          }).onConflictDoNothing()
        } else if (change.field === 'set_cpf' && input.cpf) {
          await tx
            .update(contact)
            .set({ cpf: input.cpf, updatedAt: new Date() })
            .where(eq(contact.id, contactId))
        } else if (change.field === 'update_full_name') {
          await tx
            .update(contact)
            .set({ fullName: change.to as string, updatedAt: new Date() })
            .where(eq(contact.id, contactId))
        }
      }

      await emitTimelineEvent(
        {
          contactId,
          kind: 'contact_updated',
          source: 'MOD-CONTACT',
          actorUserId: ctx.user.id,
          payload: {
            field: 'identity',
            from: null,
            to: input.origin,
          },
        },
        tx,
      )

      return {
        contactId,
        action: 'update' as const,
        issues: resolution.issues,
      }
    })

    revalidatePath('/contacts')
    return result
  })
}

/**
 * addTag — adiciona tag a um contato (idempotente).
 * Guard: contact.write
 */
export async function addTag(contactId: string, tag: string, source?: string) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = addTagSchema.parse({ contactId, tag, source })

    await db.transaction(async (tx) => {
      await tx
        .insert(contactTag)
        .values({
          contactId: input.contactId,
          tag: input.tag,
          source: input.source,
          appliedBy: ctx.user.id,
        })
        .onConflictDoNothing()

      await emitTimelineEvent(
        {
          contactId: input.contactId,
          kind: 'contact_tag_added',
          source: 'MOD-CONTACT',
          actorUserId: ctx.user.id,
          payload: {
            tag: input.tag,
            source: input.source,
          },
        },
        tx,
      )
    })

    revalidatePath(`/contacts/${input.contactId}`)
  })
}

/**
 * removeTag — remove tag de um contato.
 * Guard: contact.write
 */
export async function removeTag(contactId: string, tag: string) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = removeTagSchema.parse({ contactId, tag })

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
          payload: {
            tag: input.tag,
          },
        },
        tx,
      )
    })

    revalidatePath(`/contacts/${input.contactId}`)
  })
}

/**
 * changeStatus — altera status do contato com histórico e audit.
 * Guard: contact.write
 * BR-MERGE: contato mesclado é imutável.
 */
export async function changeStatus(contactId: string, toStatus: string, reason?: string) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = changeStatusSchema.parse({ contactId, toStatus, reason })

    await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: contact.id,
          status: contact.status,
          mergedIntoId: contact.mergedIntoId,
        })
        .from(contact)
        .where(and(eq(contact.id, input.contactId), isNull(contact.deletedAt)))
        .limit(1)

      const current = rows[0]
      if (!current) {
        throw new ActionError('NOT_FOUND', `contact ${input.contactId} not found`)
      }

      // BR-MERGE: contato mesclado é imutável
      if (current.mergedIntoId !== null) {
        throw new ActionError(
          'FORBIDDEN',
          'merged contact is immutable',
          { rule: 'BR-MERGE' },
        )
      }

      const fromStatus = current.status

      await tx
        .update(contact)
        .set({ status: input.toStatus, updatedAt: new Date() })
        .where(eq(contact.id, input.contactId))

      await tx.insert(contactStatusHistory).values({
        contactId: input.contactId,
        fromStatus,
        toStatus: input.toStatus,
        changedBy: ctx.user.id,
        reason: input.reason ?? null,
      })

      const timelineKind =
        input.toStatus === 'blocked' ? 'contact_blacklisted' : 'contact_updated'

      const timelinePayload =
        input.toStatus === 'blocked'
          ? { from_status: fromStatus, reason: input.reason }
          : { field: 'status', from: fromStatus, to: input.toStatus }

      await emitTimelineEvent(
        {
          contactId: input.contactId,
          kind: timelineKind,
          source: 'MOD-CONTACT',
          actorUserId: ctx.user.id,
          payload: timelinePayload,
        },
        tx,
      )

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'status_change',
        resourceKind: 'contact',
        resourceId: input.contactId,
        before: { status: fromStatus },
        after: { status: input.toStatus },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId, reason: input.reason },
      })
    })

    revalidatePath(`/contacts/${input.contactId}`)
  })
}

/**
 * addNote — adiciona nota a um contato.
 * Guard: contact.write
 */
export async function addNote(contactId: string, body: string, pinned?: boolean) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = addNoteSchema.parse({ contactId, body, pinned })

    await db.transaction(async (tx) => {
      await tx.insert(contactNote).values({
        contactId: input.contactId,
        authorUserId: ctx.user.id,
        body: input.body,
        pinned: input.pinned,
      })
    })

    revalidatePath(`/contacts/${input.contactId}`)
  })
}

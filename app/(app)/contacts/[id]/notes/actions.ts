'use server'

/**
 * Server Actions — Tab Notas do Contato (T-12-14)
 *
 * Ownership: app/(app)/contacts/[id]/notes/actions.ts
 * Spec: docs/20-domain/02-contact-identity.md §3.7
 * Contrato: docs/30-contracts/05-api-server-actions.md
 */

import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/lib/db/client'
import { contactNote } from '@/lib/db/schema/contact'
import { userAccount } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { toActionResult } from '@/lib/actions/result'
import { ActionError } from '@/lib/actions/errors'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createNoteSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  body: z.string().min(1, 'Nota não pode ser vazia').max(10000),
})

const updateNoteSchema = z.object({
  id: z.string().uuid('id deve ser UUID'),
  body: z.string().min(1, 'Nota não pode ser vazia').max(10000),
})

const deleteNoteSchema = z.object({
  id: z.string().uuid('id deve ser UUID'),
})

const listNotesSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
})

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type NoteRow = {
  id: string
  contactId: string
  authorUserId: string
  authorEmail: string
  authorName: string
  body: string
  pinned: boolean
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// createNoteAction
// ---------------------------------------------------------------------------

/**
 * createNoteAction — insere uma nota vinculada ao contato.
 * Guard: contact.write
 */
export async function createNoteAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = createNoteSchema.parse(rawInput)

    const [inserted] = await db.transaction(async (tx) => {
      return tx
        .insert(contactNote)
        .values({
          contactId: input.contactId,
          authorUserId: ctx.user.id,
          body: input.body,
          pinned: false,
        })
        .returning()
    })

    revalidatePath(`/contacts/${input.contactId}`)
    return inserted!
  })
}

// ---------------------------------------------------------------------------
// updateNoteAction
// ---------------------------------------------------------------------------

/**
 * updateNoteAction — atualiza o corpo de uma nota existente.
 * Só o autor da nota pode editá-la.
 * Guard: contact.write
 */
export async function updateNoteAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = updateNoteSchema.parse(rawInput)

    const [updated] = await db.transaction(async (tx) => {
      // Verificar existência e ownership
      const existing = await tx
        .select({ id: contactNote.id, authorUserId: contactNote.authorUserId, contactId: contactNote.contactId })
        .from(contactNote)
        .where(eq(contactNote.id, input.id))
        .limit(1)

      const note = existing[0]
      if (!note) {
        throw new ActionError('NOT_FOUND', `Nota ${input.id} não encontrada`)
      }

      // Somente o autor pode editar sua nota
      if (note.authorUserId !== ctx.user.id) {
        throw new ActionError('UNAUTHORIZED', 'Somente o autor pode editar a nota', { rule: 'BR-RBAC' })
      }

      return tx
        .update(contactNote)
        .set({ body: input.body, updatedAt: new Date() })
        .where(eq(contactNote.id, input.id))
        .returning()
    })

    if (updated) {
      revalidatePath(`/contacts/${updated.contactId}`)
    }

    return updated!
  })
}

// ---------------------------------------------------------------------------
// deleteNoteAction
// ---------------------------------------------------------------------------

/**
 * deleteNoteAction — remove fisicamente uma nota.
 * Somente o autor pode excluir sua nota.
 * Guard: contact.write
 */
export async function deleteNoteAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.write', { kind: 'global' })

    const input = deleteNoteSchema.parse(rawInput)

    await db.transaction(async (tx) => {
      // Verificar existência e ownership
      const existing = await tx
        .select({ id: contactNote.id, authorUserId: contactNote.authorUserId, contactId: contactNote.contactId })
        .from(contactNote)
        .where(eq(contactNote.id, input.id))
        .limit(1)

      const note = existing[0]
      if (!note) {
        throw new ActionError('NOT_FOUND', `Nota ${input.id} não encontrada`)
      }

      // Somente o autor pode excluir sua nota
      if (note.authorUserId !== ctx.user.id) {
        throw new ActionError('UNAUTHORIZED', 'Somente o autor pode excluir a nota', { rule: 'BR-RBAC' })
      }

      await tx.delete(contactNote).where(eq(contactNote.id, input.id))

      revalidatePath(`/contacts/${note.contactId}`)
    })

    return { deleted: true }
  })
}

// ---------------------------------------------------------------------------
// listNotesAction
// ---------------------------------------------------------------------------

/**
 * listNotesAction — retorna as notas de um contato ordenadas por created_at DESC.
 * Inclui dados do autor (email + nome) via join com user_account.
 * Guard: requireSession
 */
export async function listNotesAction(rawInput: unknown) {
  return toActionResult(async () => {
    await requireSession()

    const input = listNotesSchema.parse(rawInput)

    const rows = await db
      .select({
        id: contactNote.id,
        contactId: contactNote.contactId,
        authorUserId: contactNote.authorUserId,
        authorEmail: userAccount.email,
        authorName: userAccount.fullName,
        body: contactNote.body,
        pinned: contactNote.pinned,
        createdAt: contactNote.createdAt,
        updatedAt: contactNote.updatedAt,
      })
      .from(contactNote)
      .innerJoin(userAccount, eq(contactNote.authorUserId, userAccount.id))
      .where(eq(contactNote.contactId, input.contactId))
      .orderBy(desc(contactNote.createdAt))
      .limit(200)

    return rows as NoteRow[]
  })
}

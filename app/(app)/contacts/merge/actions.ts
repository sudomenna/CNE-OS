'use server'

/**
 * MOD-MERGE — Server Actions de merge de contatos
 *
 * docs/20-domain/03-contact-merge-issues.md §4-§5
 * docs/30-contracts/05-api-server-actions.md
 * docs/50-business-rules/BR-MERGE.md / BR-RBAC
 *
 * ADR-10: erros de domínio são capturados aqui e convertidos para ActionResult.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'
import { ActionError } from '@/lib/actions/errors'
import { mergeContacts } from '@/lib/domain/merge/apply'
import { undoMerge } from '@/lib/domain/merge/undo'
import {
  SameContactError,
  SecondaryAlreadyMergedError,
  PrincipalAlreadyMergedError,
  AlreadyUndoneError,
  MergeNotFoundError,
  MergeForbiddenError,
} from '@/lib/domain/merge/errors'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const mergeContactsSchema = z.object({
  principalContactId: z.string().uuid(),
  secondaryContactId: z.string().uuid(),
  reason: z.string().min(1, 'Motivo é obrigatório'),
  issueId: z.string().uuid().optional(),
})

const undoMergeSchema = z.object({
  mergeId: z.string().uuid(),
  reason: z.string().min(1, 'Motivo é obrigatório'),
})

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * mergeContactsAction — executa merge entre dois contatos.
 * Guard: contact.merge (todos os roles) — BR-RBAC
 */
export async function mergeContactsAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.merge', { kind: 'global' })

    const input = mergeContactsSchema.parse(rawInput)

    // BR-MERGE: principal e secundário devem ser distintos (guard redundante — domínio já lança SameContactError)
    if (input.principalContactId === input.secondaryContactId) {
      throw new ActionError('VALIDATION', 'principal and secondary must be different contacts', {
        rule: 'BR-MERGE',
      })
    }

    const result = await db.transaction(async (tx) => {
      const mergeResult = await mergeContacts(tx, {
        principalId: input.principalContactId,
        secondaryId: input.secondaryContactId,
        reason: input.reason,
        ...(input.issueId !== undefined ? { issueId: input.issueId } : {}),
        actorUserId: ctx.user.id,
      }).catch((err: unknown) => {
        if (err instanceof SameContactError) {
          throw new ActionError('VALIDATION', err.message, { rule: 'BR-MERGE' })
        }
        if (err instanceof SecondaryAlreadyMergedError || err instanceof PrincipalAlreadyMergedError) {
          throw new ActionError('FORBIDDEN', err.message)
        }
        throw err
      })

      // BR-AUDIT §3: audit dentro da mesma transação
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'merge',
        resourceKind: 'contact',
        resourceId: input.principalContactId,
        before: {},
        after: {
          principalContactId: input.principalContactId,
          secondaryContactId: input.secondaryContactId,
          mergeId: mergeResult.mergeId,
          reason: input.reason,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return mergeResult
    })

    revalidatePath('/contacts')
    revalidatePath(`/contacts/${input.principalContactId}`)

    return {
      mergeId: result.mergeId,
      principalId: result.principalId,
      secondaryId: result.secondaryId,
    }
  })
}

/**
 * undoMergeAction — desfaz um merge existente.
 * Guard: contact.unmerge (admin e financial com 2FA) — BR-RBAC / BR-MERGE
 */
export async function undoMergeAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'contact.unmerge', { kind: 'global' })

    const input = undoMergeSchema.parse(rawInput)

    await db.transaction(async (tx) => {
      await undoMerge(tx, {
        mergeId: input.mergeId,
        reason: input.reason,
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
      }).catch((err: unknown) => {
        if (err instanceof AlreadyUndoneError) {
          throw new ActionError('FORBIDDEN', 'merge already undone')
        }
        if (err instanceof MergeNotFoundError) {
          throw new ActionError('NOT_FOUND', err.message)
        }
        if (err instanceof MergeForbiddenError) {
          throw new ActionError('FORBIDDEN', err.message)
        }
        throw err
      })

      // BR-AUDIT §3: audit dentro da mesma transação
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'unmerge',
        resourceKind: 'contact_merge',
        resourceId: input.mergeId,
        before: {},
        after: { mergeId: input.mergeId, reason: input.reason },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })
    })

    revalidatePath('/contacts')
  })
}

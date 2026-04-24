'use server'

/**
 * MOD-MERGE — Server Actions de issues de contato
 *
 * docs/20-domain/03-contact-merge-issues.md §3.1
 * docs/30-contracts/05-api-server-actions.md
 * docs/50-business-rules/BR-MERGE.md
 *
 * ADR-10: erros são capturados e convertidos para ActionResult.
 */

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { contactIssue } from '@/lib/db/schema/contact_merge'
import { requireSession } from '@/lib/auth/session'
import { toActionResult } from '@/lib/actions/result'
import { ActionError } from '@/lib/actions/errors'
import { emitTimelineEvent } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const openIssueSchema = z.object({
  contactId: z.string().uuid(),
  relatedContactId: z.string().uuid().optional(),
  kind: z.enum([
    'email_duplicate',
    'phone_conflict',
    'document_mismatch',
    'source_divergence',
    'other',
  ]),
  detail: z.string().min(1, 'Detalhe é obrigatório'),
  payload: z.record(z.unknown()).default({}),
})

const resolveIssueSchema = z.object({
  issueId: z.string().uuid(),
  resolution: z.string().min(1, 'Resolução é obrigatória'),
  status: z.enum(['resolved', 'ignored']).default('resolved'),
})

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * openIssueAction — abre uma nova issue para um contato.
 * Qualquer usuário autenticado pode abrir issue (sem requirePermission específica).
 */
export async function openIssueAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()

    const input = openIssueSchema.parse(rawInput)

    const rows = await db
      .insert(contactIssue)
      .values({
        contactId: input.contactId,
        relatedContactId: input.relatedContactId ?? null,
        kind: input.kind,
        detail: input.detail,
        payload: input.payload,
        openedByUserId: ctx.user.id,
        openedBySystem: null,
      })
      .returning({ id: contactIssue.id })

    const row = rows[0]
    if (!row) {
      throw new ActionError('INTERNAL', 'openIssueAction: INSERT returned no row')
    }

    const issueId = row.id

    await emitTimelineEvent({
      contactId: input.contactId,
      kind: 'contact_issue_opened',
      source: 'MOD-MERGE',
      actorUserId: ctx.user.id,
      payload: {
        issue_id: issueId,
        kind: input.kind,
        detail: input.detail,
      },
    })

    revalidatePath(`/contacts/${input.contactId}/issues`)

    return { issueId }
  })
}

/**
 * resolveIssueAction — resolve ou ignora uma issue existente.
 * Qualquer usuário autenticado pode resolver issue.
 */
export async function resolveIssueAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()

    const input = resolveIssueSchema.parse(rawInput)

    // Buscar a issue para obter o contactId e validar existência
    const issues = await db
      .select({ id: contactIssue.id, contactId: contactIssue.contactId, status: contactIssue.status })
      .from(contactIssue)
      .where(eq(contactIssue.id, input.issueId))

    const issue = issues[0]
    if (!issue) {
      throw new ActionError('NOT_FOUND', `issue ${input.issueId} not found`)
    }

    await db
      .update(contactIssue)
      .set({
        status: input.status,
        resolvedByUserId: ctx.user.id,
        resolvedAt: new Date(),
        resolution: input.resolution,
        updatedAt: new Date(),
      })
      .where(eq(contactIssue.id, input.issueId))

    await emitTimelineEvent({
      contactId: issue.contactId,
      kind: 'contact_issue_resolved',
      source: 'MOD-MERGE',
      actorUserId: ctx.user.id,
      payload: {
        issue_id: input.issueId,
        resolution: input.resolution,
      },
    })

    revalidatePath(`/contacts/${issue.contactId}/issues`)
  })
}

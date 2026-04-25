/**
 * MOD-AUTOMATION — Action: apply_tag (T-11-08)
 *
 * docs/20-domain/15-automation.md §7 Actions
 * ADR-11: tx obrigatório como primeiro argumento
 *
 * Adiciona uma tag ao contato identificado por ctx.subjectId.
 * Idempotente via onConflictDoNothing (uq_contact_tag).
 */
import { and, eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { contact, contactTag } from '@/lib/db/schema/contact'
import type { RunFlowContext } from '../run-flow'
import type { ActionEffect } from './types'

export type ApplyTagParams = {
  tag: string
}

/**
 * apply_tag — adiciona tag ao contato subject.
 *
 * Pré: ctx.subjectKind === 'contact'
 * Pós: insere em contact_tag se não existir (idempotente); retorna se foi aplicada ou já existia.
 */
export async function applyTag(
  params: ApplyTagParams,
  ctx: RunFlowContext,
  tx: DbTx,
): Promise<ActionEffect> {
  // BR-AUTOMATION: apply_tag só opera em subjects do tipo contact
  if (ctx.subjectKind !== 'contact') {
    return { ok: false, error: 'subject is not a contact' }
  }

  const contactId = ctx.subjectId

  // Verificar existência do contato antes de inserir tag
  const [existing] = await tx
    .select({ id: contact.id })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1)

  if (!existing) {
    return { ok: false, error: `contact ${contactId} not found` }
  }

  // Verificar se tag já existe antes de inserir (para retornar applied corretamente)
  const [existingTag] = await tx
    .select({ id: contactTag.id })
    .from(contactTag)
    .where(and(eq(contactTag.contactId, contactId), eq(contactTag.tag, params.tag)))
    .limit(1)

  if (existingTag) {
    // Tag já existe — idempotente, não duplica
    return { ok: true, output: { tag: params.tag, applied: false } }
  }

  // Inserir tag (source='automation' — docs/30-contracts/07-module-interfaces.md §MOD-CONTACT)
  await tx.insert(contactTag).values({
    contactId,
    tag: params.tag,
    source: 'automation',
    appliedBy: null,
  })

  return { ok: true, output: { tag: params.tag, applied: true } }
}

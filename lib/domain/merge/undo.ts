/**
 * MOD-MERGE — undoMerge
 *
 * docs/20-domain/03-contact-merge-issues.md §5
 * docs/50-business-rules/BR-MERGE.md
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 * ADR-15: mutações antes de emits na mesma tx
 */
import { eq, inArray, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  contactPhone,
  contactEmail,
  contactDocument,
  contactTag,
  contact,
} from '@/lib/db/schema/contact'
import { contactMerge, contactMergeUndo } from '@/lib/db/schema/contact_merge'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import {
  MergeNotFoundError,
  AlreadyUndoneError,
  MergeForbiddenError,
} from './errors'
import type { ContactSnapshot } from './apply'

export type UndoInput = {
  mergeId: string
  reason: string
  actorUserId: string
  // BR-MERGE: somente 'admin' ou 'financial' podem desfazer merge
  actorRole: string
}

// Constante de papéis autorizados (BR-RBAC / BR-MERGE)
const ALLOWED_ROLES = ['admin', 'financial'] as const

export async function undoMerge(tx: DbTx, input: UndoInput): Promise<void> {
  const { mergeId, reason, actorUserId, actorRole } = input

  // BR-MERGE / BR-RBAC: somente admin ou financial podem desfazer merge
  if (!ALLOWED_ROLES.includes(actorRole as (typeof ALLOWED_ROLES)[number])) {
    throw new MergeForbiddenError('only admin or financial can undo merge')
  }

  // Buscar o registro de merge
  const mergeRows = await tx
    .select()
    .from(contactMerge)
    .where(eq(contactMerge.id, mergeId))

  const merge = mergeRows[0]
  if (!merge) {
    throw new MergeNotFoundError(mergeId)
  }

  // BR-MERGE INV-MERGE-04: undo ocorre no máximo uma vez por merge
  if (merge.undoneAt !== null) {
    throw new AlreadyUndoneError(mergeId)
  }

  const principalId = merge.principalContactId
  const secondaryId = merge.secondaryContactId

  // Extrair snapshot do secundário para saber quais registros reverter
  const secondarySnapshot = merge.secondarySnapshot as ContactSnapshot

  const phoneIds = secondarySnapshot.phones?.map((p) => p.id) ?? []
  const emailIds = secondarySnapshot.emails?.map((e) => e.id) ?? []
  const documentIds = secondarySnapshot.documents?.map((d) => d.id) ?? []
  const tagIds = secondarySnapshot.tags?.map((t) => t.id) ?? []

  // Reverter contato: limpar merged_into_id no secundário
  await tx
    .update(contact)
    .set({ mergedIntoId: null, updatedAt: sql`now()` })
    .where(eq(contact.id, secondaryId))

  // Reverter FKs usando IDs do snapshot do secundário
  const revertedTables: Record<string, number> = {}

  if (phoneIds.length > 0) {
    const result = await tx
      .update(contactPhone)
      .set({ contactId: secondaryId })
      .where(inArray(contactPhone.id, phoneIds))
      .returning({ id: contactPhone.id })
    revertedTables['contact_phone'] = result.length
  } else {
    revertedTables['contact_phone'] = 0
  }

  if (emailIds.length > 0) {
    const result = await tx
      .update(contactEmail)
      .set({ contactId: secondaryId })
      .where(inArray(contactEmail.id, emailIds))
      .returning({ id: contactEmail.id })
    revertedTables['contact_email'] = result.length
  } else {
    revertedTables['contact_email'] = 0
  }

  if (documentIds.length > 0) {
    const result = await tx
      .update(contactDocument)
      .set({ contactId: secondaryId })
      .where(inArray(contactDocument.id, documentIds))
      .returning({ id: contactDocument.id })
    revertedTables['contact_document'] = result.length
  } else {
    revertedTables['contact_document'] = 0
  }

  if (tagIds.length > 0) {
    const result = await tx
      .update(contactTag)
      .set({ contactId: secondaryId })
      .where(inArray(contactTag.id, tagIds))
      .returning({ id: contactTag.id })
    revertedTables['contact_tag'] = result.length
  } else {
    revertedTables['contact_tag'] = 0
  }

  // contact_custom_field, contact_note, contact_status_history:
  // o snapshot atual não inclui IDs desses — reverter todos que pertencem ao principal
  // que originalmente eram do secundário requer query adicional.
  // Simplificação Fase 1: não incluídos no snapshot, sem reversão automática.
  // TODO: incluir esses campos no snapshot em versão futura da BR-MERGE.
  revertedTables['contact_custom_field'] = 0
  revertedTables['contact_note'] = 0
  revertedTables['contact_status_history'] = 0

  // Marcar contact_merge.undone_at
  await tx
    .update(contactMerge)
    .set({ undoneAt: sql`now()` })
    .where(eq(contactMerge.id, mergeId))

  // Inserir contact_merge_undo
  // Se já existe (violação de uq_contact_merge_undo_merge) → DB lança erro → mapear para AlreadyUndoneError
  try {
    await tx.insert(contactMergeUndo).values({
      mergeId,
      reason,
      undoneByUserId: actorUserId,
      revertedTables,
    })
  } catch (err) {
    // Detectar violação de unique constraint (PostgreSQL error code 23505)
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('uq_contact_merge_undo_merge') || message.includes('23505')) {
      throw new AlreadyUndoneError(mergeId)
    }
    throw err
  }

  // ADR-15: emits após todas as mutações
  // TE-CONTACT-UNMERGED no contato principal
  await emitTimelineEvent(
    {
      contactId: principalId,
      kind: 'contact_unmerged',
      source: 'MOD-MERGE',
      actorUserId,
      payload: {
        merge_id: mergeId,
        principal_contact_id: principalId,
        secondary_contact_id: secondaryId,
        reason,
      },
    },
    tx,
  )

  // TE-CONTACT-UNMERGED no contato secundário
  await emitTimelineEvent(
    {
      contactId: secondaryId,
      kind: 'contact_unmerged',
      source: 'MOD-MERGE',
      actorUserId,
      payload: {
        merge_id: mergeId,
        principal_contact_id: principalId,
        secondary_contact_id: secondaryId,
        reason,
      },
    },
    tx,
  )
}

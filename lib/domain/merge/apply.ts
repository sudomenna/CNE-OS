/**
 * MOD-MERGE — mergeContacts
 *
 * docs/20-domain/03-contact-merge-issues.md §4
 * docs/50-business-rules/BR-MERGE.md
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 * ADR-15: mutações antes de emits na mesma tx
 */
import { eq, inArray, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  contact,
  contactPhone,
  contactEmail,
  contactDocument,
  contactTag,
  contactCustomField,
  contactNote,
  contactStatusHistory,
} from '@/lib/db/schema/contact'
import { contactIssue, contactMerge } from '@/lib/db/schema/contact_merge'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import {
  SameContactError,
  PrincipalAlreadyMergedError,
  SecondaryAlreadyMergedError,
  ContactNotFoundForMergeError,
} from './errors'

export type MergeInput = {
  principalId: string
  secondaryId: string
  reason: string
  issueId?: string
  actorUserId: string
}

export type ContactSnapshot = {
  contact: {
    id: string
    fullName: string
    cpf: string | null
    status: string
    classification: string
  }
  phones: Array<{ id: string; e164: string; status: string }>
  emails: Array<{ id: string; email: string; status: string }>
  documents: Array<{ id: string; kind: string; value: string }>
  tags: Array<{ id: string; tag: string }>
}

export type MergeResult = {
  mergeId: string
  principalId: string
  secondaryId: string
}

/**
 * Lista de tabelas que têm FK contact_id e são reapontadas durante o merge.
 * Tabelas de outros módulos (transaction, conversation, ticket, subscription, etc.)
 * ainda não existem no banco na Fase 1 — serão adicionadas aqui conforme os módulos
 * forem implementados nos sprints subsequentes.
 */
async function collectSnapshot(tx: DbTx, contactId: string): Promise<ContactSnapshot> {
  const contacts = await tx
    .select({
      id: contact.id,
      fullName: contact.fullName,
      cpf: contact.cpf,
      status: contact.status,
      classification: contact.classification,
    })
    .from(contact)
    .where(eq(contact.id, contactId))

  const row = contacts[0]
  if (!row) {
    throw new ContactNotFoundForMergeError(contactId)
  }

  const phones = await tx
    .select({ id: contactPhone.id, e164: contactPhone.e164, status: contactPhone.status })
    .from(contactPhone)
    .where(eq(contactPhone.contactId, contactId))

  const emails = await tx
    .select({ id: contactEmail.id, email: contactEmail.email, status: contactEmail.status })
    .from(contactEmail)
    .where(eq(contactEmail.contactId, contactId))

  const documents = await tx
    .select({
      id: contactDocument.id,
      kind: contactDocument.kind,
      value: contactDocument.value,
    })
    .from(contactDocument)
    .where(eq(contactDocument.contactId, contactId))

  const tags = await tx
    .select({ id: contactTag.id, tag: contactTag.tag })
    .from(contactTag)
    .where(eq(contactTag.contactId, contactId))

  return {
    contact: row,
    phones,
    emails,
    documents,
    tags,
  }
}

export async function mergeContacts(
  tx: DbTx,
  input: MergeInput,
): Promise<MergeResult> {
  const { principalId, secondaryId, reason, issueId, actorUserId } = input

  // BR-MERGE: principal e secundário devem ser contatos distintos
  if (principalId === secondaryId) {
    throw new SameContactError()
  }

  // Buscar ambos os contatos para validar guards
  const contacts = await tx
    .select({
      id: contact.id,
      mergedIntoId: contact.mergedIntoId,
    })
    .from(contact)
    .where(inArray(contact.id, [principalId, secondaryId]))

  const principal = contacts.find((c) => c.id === principalId)
  const secondary = contacts.find((c) => c.id === secondaryId)

  if (!principal) {
    throw new ContactNotFoundForMergeError(principalId)
  }
  if (!secondary) {
    throw new ContactNotFoundForMergeError(secondaryId)
  }

  // BR-MERGE: principal não pode ser um contato já mergeado
  if (principal.mergedIntoId !== null) {
    throw new PrincipalAlreadyMergedError(principalId)
  }

  // BR-MERGE: secundário não pode ser um contato já mergeado
  if (secondary.mergedIntoId !== null) {
    throw new SecondaryAlreadyMergedError(secondaryId)
  }

  // Coletar snapshots antes de qualquer mutação (ADR-15)
  const principalSnapshot = await collectSnapshot(tx, principalId)
  const secondarySnapshot = await collectSnapshot(tx, secondaryId)

  // Reapontar FKs do secundário para o principal
  // Nota: tabelas de outros módulos (transaction, conversation, ticket, subscription, etc.)
  // ainda não existem no banco na Fase 1 e serão adicionadas aqui nos sprints subsequentes.
  const reassignedTables: Record<string, number> = {}

  const phoneResult = await tx
    .update(contactPhone)
    .set({ contactId: principalId })
    .where(eq(contactPhone.contactId, secondaryId))
    .returning({ id: contactPhone.id })
  reassignedTables['contact_phone'] = phoneResult.length

  const emailResult = await tx
    .update(contactEmail)
    .set({ contactId: principalId })
    .where(eq(contactEmail.contactId, secondaryId))
    .returning({ id: contactEmail.id })
  reassignedTables['contact_email'] = emailResult.length

  const documentResult = await tx
    .update(contactDocument)
    .set({ contactId: principalId })
    .where(eq(contactDocument.contactId, secondaryId))
    .returning({ id: contactDocument.id })
  reassignedTables['contact_document'] = documentResult.length

  const tagResult = await tx
    .update(contactTag)
    .set({ contactId: principalId })
    .where(eq(contactTag.contactId, secondaryId))
    .returning({ id: contactTag.id })
  reassignedTables['contact_tag'] = tagResult.length

  const customFieldResult = await tx
    .update(contactCustomField)
    .set({ contactId: principalId })
    .where(eq(contactCustomField.contactId, secondaryId))
    .returning({ id: contactCustomField.id })
  reassignedTables['contact_custom_field'] = customFieldResult.length

  const noteResult = await tx
    .update(contactNote)
    .set({ contactId: principalId })
    .where(eq(contactNote.contactId, secondaryId))
    .returning({ id: contactNote.id })
  reassignedTables['contact_note'] = noteResult.length

  const statusHistoryResult = await tx
    .update(contactStatusHistory)
    .set({ contactId: principalId })
    .where(eq(contactStatusHistory.contactId, secondaryId))
    .returning({ id: contactStatusHistory.id })
  reassignedTables['contact_status_history'] = statusHistoryResult.length

  // Reapontar contact_issue (contact_id e related_contact_id)
  const issueByContactResult = await tx
    .update(contactIssue)
    .set({ contactId: principalId })
    .where(eq(contactIssue.contactId, secondaryId))
    .returning({ id: contactIssue.id })
  reassignedTables['contact_issue'] = issueByContactResult.length

  await tx
    .update(contactIssue)
    .set({ relatedContactId: principalId })
    .where(eq(contactIssue.relatedContactId, secondaryId))

  // INV-TIMELINE-07: timeline_event.contact_id NÃO é reapontado
  // A consolidação é feita na leitura (query por principal + secundário)

  // Marcar secundário como mergeado
  await tx
    .update(contact)
    .set({ mergedIntoId: principalId, updatedAt: sql`now()` })
    .where(eq(contact.id, secondaryId))

  // Inserir registro de merge
  const mergeRows = await tx
    .insert(contactMerge)
    .values({
      principalContactId: principalId,
      secondaryContactId: secondaryId,
      reason,
      issueId: issueId ?? null,
      mergedByUserId: actorUserId,
      reassignedTables,
      principalSnapshot: principalSnapshot as Record<string, unknown>,
      secondarySnapshot: secondarySnapshot as Record<string, unknown>,
    })
    .returning({ id: contactMerge.id })

  const mergeRow = mergeRows[0]
  if (!mergeRow) {
    throw new Error('mergeContacts: INSERT contact_merge returned no row')
  }

  const mergeId = mergeRow.id

  // BR-MERGE INV-MERGE-06: se issueId fornecido, marcar issue como resolvida
  if (issueId) {
    await tx
      .update(contactIssue)
      .set({
        status: 'resolved',
        resolvedByUserId: actorUserId,
        resolvedAt: sql`now()`,
        resolution: 'resolved via merge',
      })
      .where(eq(contactIssue.id, issueId))
  }

  // ADR-15: emits após todas as mutações, na ordem natural de ocorrência
  // TE-CONTACT-MERGED no contato principal (merged_from = secundário)
  await emitTimelineEvent(
    {
      contactId: principalId,
      kind: 'contact_merged',
      source: 'MOD-MERGE',
      actorUserId,
      payload: {
        merged_into: principalId,
        merged_from: secondaryId,
        reason,
      },
    },
    tx,
  )

  // TE-CONTACT-MERGED no contato secundário (merged_into = principal)
  await emitTimelineEvent(
    {
      contactId: secondaryId,
      kind: 'contact_merged',
      source: 'MOD-MERGE',
      actorUserId,
      payload: {
        merged_into: principalId,
        merged_from: secondaryId,
        reason,
      },
    },
    tx,
  )

  return { mergeId, principalId, secondaryId }
}

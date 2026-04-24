/**
 * /contacts/[id]/issues — Página de pendências de identidade de um contato.
 *
 * Server Component que lista as issues abertas do contato e permite resolução
 * via ResolveDialog (Client Component embutido em IssueCard).
 *
 * MOD-MERGE | docs/20-domain/03-contact-merge-issues.md
 */

import { and, eq, inArray } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db/client'
import { contact } from '@/lib/db/schema/contact'
import { contactIssue } from '@/lib/db/schema/contact_merge'
import { IssueCard } from '@/components/merge/issue-card'
import { requireSession } from '@/lib/auth/session'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ContactIssuesPage(props: Props) {
  await requireSession()

  const params = await props.params
  const contactId = params.id

  // Buscar o contato principal para exibir o nome no breadcrumb
  const contactRows = await db
    .select({ id: contact.id, fullName: contact.fullName })
    .from(contact)
    .where(eq(contact.id, contactId))

  const mainContact = contactRows[0]
  if (!mainContact) {
    notFound()
  }

  // Buscar issues abertas do contato ordenadas por data de criação
  const issues = await db
    .select()
    .from(contactIssue)
    .where(
      and(
        eq(contactIssue.contactId, contactId),
        eq(contactIssue.status, 'open'),
      ),
    )
    .orderBy(contactIssue.createdAt)

  // Buscar nomes dos contatos relacionados (se houver)
  const relatedIds = issues
    .map((i) => i.relatedContactId)
    .filter((id): id is string => id !== null)

  let relatedContacts: { id: string; fullName: string }[] = []
  if (relatedIds.length > 0) {
    relatedContacts = await db
      .select({ id: contact.id, fullName: contact.fullName })
      .from(contact)
      .where(inArray(contact.id, relatedIds))
  }

  const relatedMap = new Map(relatedContacts.map((c) => [c.id, c.fullName]))

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navegação" className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/contacts" className="hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          Contatos
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-slate-700 font-medium">{mainContact.fullName}</span>
        <span aria-hidden="true">/</span>
        <span className="text-slate-900 font-semibold">Issues</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pendencias de Identidade</h1>
        <p className="mt-1 text-sm text-slate-500">
          {issues.length === 0
            ? 'Nenhuma pendencia aberta.'
            : `${issues.length} pendencia${issues.length > 1 ? 's' : ''} aberta${issues.length > 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Lista de issues */}
      {issues.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm text-slate-500">Nenhuma pendencia aberta para este contato.</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Pendencias de identidade">
          {issues.map((issue) => (
            <li key={issue.id}>
              <IssueCard
                issue={issue}
                relatedContactName={
                  issue.relatedContactId
                    ? relatedMap.get(issue.relatedContactId)
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

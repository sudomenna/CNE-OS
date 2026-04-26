import { Suspense } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { contact } from '@/lib/db/schema/contact'
import type { ContactRow } from '@/components/contact/contact-list'
import { ContactList } from '@/components/contact/contact-list'
import { ContactFilters } from '@/components/contact/contact-filters'
import {
  ContactListSkeleton,
  ContactListEmptyState,
} from '@/components/contact/contact-list-skeleton'

export const metadata = {
  title: 'Contatos — CNE-OS',
}

const PAGE_SIZE = 50

type ContactClassification = 'lead' | 'customer' | 'student' | 'paid_lead'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// ---------------------------------------------------------------------------
// Async sub-component — isolado para Suspense streaming
// ---------------------------------------------------------------------------

interface ContactListDataProps {
  search?: string | undefined
  classification?: ContactClassification | undefined
  page: number
}

async function ContactListData({ search, classification, page }: ContactListDataProps) {
  const whereConditions = [
    isNull(contact.deletedAt),
    isNull(contact.mergedIntoId),
    ...(classification ? [eq(contact.classification, classification)] : []),
    ...(search
      ? [
          or(
            ilike(contact.fullName, `%${search}%`),
            ilike(sql<string>`coalesce(${contact.cpf}, '')`, `%${search}%`),
          ),
        ]
      : []),
  ]

  const contacts = await db
    .select({
      id: contact.id,
      fullName: contact.fullName,
      cpf: contact.cpf,
      status: contact.status,
      classification: contact.classification,
      origin: contact.origin,
      createdAt: contact.createdAt,
    })
    .from(contact)
    .where(and(...whereConditions))
    .orderBy(contact.createdAt)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  if (contacts.length === 0) {
    return <ContactListEmptyState />
  }

  return <ContactList contacts={contacts as ContactRow[]} />
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ContactsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const search = typeof params['search'] === 'string' ? params['search'].trim() : undefined
  const classification =
    typeof params['classification'] === 'string' && params['classification'] !== ''
      ? (params['classification'] as ContactClassification)
      : undefined
  const page = Math.max(1, Number(params['page'] ?? '1'))

  // Count query runs in parallel with the main data (both inside ContactListData Suspense boundary)
  const whereConditions = [
    isNull(contact.deletedAt),
    isNull(contact.mergedIntoId),
    ...(classification ? [eq(contact.classification, classification)] : []),
    ...(search
      ? [
          or(
            ilike(contact.fullName, `%${search}%`),
            ilike(sql<string>`coalesce(${contact.cpf}, '')`, `%${search}%`),
          ),
        ]
      : []),
  ]

  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(contact)
    .where(and(...whereConditions))

  const total = countResult[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const buildPageUrl = (p: number) => {
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (classification) qs.set('classification', classification)
    qs.set('page', String(p))
    return `/contacts?${qs.toString()}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contatos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} {total === 1 ? 'contato encontrado' : 'contatos encontrados'}
          </p>
        </div>
        <Link
          href={'/contacts/new' as Route}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
        >
          Novo Contato
        </Link>
      </div>

      {/* Filters */}
      <ContactFilters />

      {/* Table with Suspense streaming */}
      <Suspense fallback={<ContactListSkeleton rows={PAGE_SIZE > 10 ? 10 : PAGE_SIZE} />}>
        <ContactListData search={search} classification={classification} page={page} />
      </Suspense>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Paginacao de contatos"
          className="flex items-center justify-between border-t border-border pt-4"
        >
          <div>
            {page > 1 ? (
              <Link
                href={buildPageUrl(page - 1) as Route}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Anterior
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-md border border-border bg-muted/50 px-4 text-sm font-medium text-muted-foreground/60 cursor-not-allowed">
                Anterior
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Pagina <strong>{page}</strong> de <strong>{totalPages}</strong>
          </p>

          <div>
            {page < totalPages ? (
              <Link
                href={buildPageUrl(page + 1) as Route}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Proxima
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-md border border-border bg-muted/50 px-4 text-sm font-medium text-muted-foreground/60 cursor-not-allowed">
                Proxima
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}

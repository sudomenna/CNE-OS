import Link from 'next/link'
import type { Route } from 'next'
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { contact } from '@/lib/db/schema/contact'
import type { ContactRow } from '@/components/contact/contact-list'
import { ContactList } from '@/components/contact/contact-list'
import { ContactFilters } from '@/components/contact/contact-filters'

export const metadata = {
  title: 'Contatos — CNE-OS',
}

const PAGE_SIZE = 50

type ContactClassification = 'lead' | 'customer' | 'student' | 'paid_lead'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ContactsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const search = typeof params['search'] === 'string' ? params['search'].trim() : undefined
  const classification =
    typeof params['classification'] === 'string' && params['classification'] !== ''
      ? (params['classification'] as ContactClassification)
      : undefined
  const page = Math.max(1, Number(params['page'] ?? '1'))

  // Build where conditions
  const whereConditions = [
    isNull(contact.deletedAt),
    isNull(contact.mergedIntoId),
    ...(classification ? [eq(contact.classification, classification)] : []),
    ...(search
      ? [
          or(
            ilike(contact.fullName, `%${search}%`),
            // CPF is nullable; cast to text so ilike works safely on non-null rows
            ilike(sql<string>`coalesce(${contact.cpf}, '')`, `%${search}%`),
          ),
        ]
      : []),
  ]

  const [contacts, countResult] = await Promise.all([
    db
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
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(contact)
      .where(and(...whereConditions)),
  ])

  const total = countResult[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Build pagination URLs preserving existing filters
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
          <h1 className="text-2xl font-bold text-slate-900">Contatos</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} {total === 1 ? 'contato encontrado' : 'contatos encontrados'}
          </p>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white opacity-40 cursor-not-allowed"
          title="Disponivel em breve"
        >
          Novo Contato
        </button>
      </div>

      {/* Filters */}
      <ContactFilters />

      {/* Table */}
      <ContactList contacts={contacts as ContactRow[]} />

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Paginacao de contatos"
          className="flex items-center justify-between border-t border-slate-200 pt-4"
        >
          <div>
            {page > 1 ? (
              <Link
                href={buildPageUrl(page - 1) as Route}
                className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                Anterior
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-400 cursor-not-allowed">
                Anterior
              </span>
            )}
          </div>

          <p className="text-sm text-slate-600">
            Pagina <strong>{page}</strong> de <strong>{totalPages}</strong>
          </p>

          <div>
            {page < totalPages ? (
              <Link
                href={buildPageUrl(page + 1) as Route}
                className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                Proxima
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-400 cursor-not-allowed">
                Proxima
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}

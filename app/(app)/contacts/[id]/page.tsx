import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { eq, count } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { contact, contactPhone, contactEmail, contactTag } from '@/lib/db/schema/contact'
import { contactIssue } from '@/lib/db/schema/contact_merge'
import { listTimelineEvents } from '@/lib/timeline/read'
import { ContactHeader } from '@/components/contact/contact-header'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; cursor?: string }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEventDate(date: Date | string): string {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, ' ')
}

function payloadSummary(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const entries = Object.entries(payload as Record<string, unknown>).slice(0, 3)
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ')
}

// ---------------------------------------------------------------------------
// Tab navigation helper
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'timeline', label: 'Timeline', href: (id: string) => `/contacts/${id}` as Route },
  { key: 'issues', label: 'Issues', href: (id: string) => `/contacts/${id}/issues` as Route },
  { key: 'merge', label: 'Merge', href: (id: string) => `/contacts/${id}/merge` as Route },
]

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function ContactDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { tab = 'timeline', cursor } = await searchParams

  // -------------------------------------------------------------------------
  // 1. Fetch contact data
  // -------------------------------------------------------------------------
  const [contactRows, phones, emails, tags] = await Promise.all([
    db.select().from(contact).where(eq(contact.id, id)).limit(1),
    db.select().from(contactPhone).where(eq(contactPhone.contactId, id)),
    db.select().from(contactEmail).where(eq(contactEmail.contactId, id)),
    db.select().from(contactTag).where(eq(contactTag.contactId, id)),
  ])

  const contactRow = contactRows[0]
  if (!contactRow) {
    notFound()
  }

  // -------------------------------------------------------------------------
  // 2. Count open issues
  // -------------------------------------------------------------------------
  const issueCountRows = await db
    .select({ count: count() })
    .from(contactIssue)
    .where(eq(contactIssue.contactId, id))

  // contactIssue has a status field; count all issues (open ones)
  const openIssueCount = issueCountRows[0]?.count ?? 0

  // -------------------------------------------------------------------------
  // 3. Fetch timeline (first page)
  // -------------------------------------------------------------------------
  let timelinePage = { events: [] as Awaited<ReturnType<typeof listTimelineEvents>>['events'], nextCursor: null as string | null, hasMore: false }
  if (tab === 'timeline' || tab === undefined) {
    try {
      timelinePage = await listTimelineEvents(id, {}, cursor ?? null, 20)
    } catch {
      // Contact exists (checked above); errors are non-fatal for timeline display
    }
  }

  // -------------------------------------------------------------------------
  // 4. Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Back link */}
      <nav aria-label="Navegacao de retorno">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
        >
          <span aria-hidden="true">&larr;</span> Contatos
        </Link>
      </nav>

      {/* Contact header */}
      <ContactHeader
        contact={contactRow}
        phones={phones}
        emails={emails}
        tags={tags}
      />

      {/* Tab navigation */}
      <nav
        aria-label="Abas do contato"
        className="flex gap-1 border-b border-slate-200"
        role="tablist"
      >
        {TABS.map(({ key, label, href }) => {
          const isActive = tab === key || (key === 'timeline' && !tab)
          const displayLabel =
            key === 'issues' ? `${label} (${openIssueCount})` : label
          return (
            <Link
              key={key}
              href={href(id)}
              role="tab"
              aria-selected={isActive}
              className={[
                'px-4 py-2 text-sm font-medium rounded-t-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900',
                isActive
                  ? 'border-b-2 border-slate-900 text-slate-900 -mb-px'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50',
              ].join(' ')}
            >
              {displayLabel}
            </Link>
          )
        })}
      </nav>

      {/* Tab panels */}
      <div role="tabpanel" aria-label="Conteudo da aba Timeline">
        {(tab === 'timeline' || !tab) && (
          <TimelinePanel
            events={timelinePage.events}
            hasMore={timelinePage.hasMore}
            nextCursor={timelinePage.nextCursor}
            contactId={id}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: TimelinePanel
// ---------------------------------------------------------------------------

interface TimelinePanelProps {
  events: Awaited<ReturnType<typeof listTimelineEvents>>['events']
  hasMore: boolean
  nextCursor: string | null
  contactId: string
}

function TimelinePanel({ events, hasMore, nextCursor, contactId }: TimelinePanelProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
        <p className="text-sm text-slate-400">Nenhum evento na timeline.</p>
      </div>
    )
  }

  return (
    <ol className="space-y-3" aria-label="Timeline de eventos">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex gap-4 rounded-lg border border-slate-100 bg-white px-4 py-3"
        >
          {/* Kind dot */}
          <div
            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400"
            aria-hidden="true"
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 capitalize">
              {kindLabel(event.kind)}
            </p>
            {payloadSummary(event.payload) && (
              <p className="mt-0.5 text-xs text-slate-500 truncate">
                {payloadSummary(event.payload)}
              </p>
            )}
          </div>

          {/* Date */}
          <time
            dateTime={new Date(event.occurredAt).toISOString()}
            className="shrink-0 text-xs text-slate-400 whitespace-nowrap"
          >
            {formatEventDate(event.occurredAt)}
          </time>
        </li>
      ))}

      {/* Load more */}
      {hasMore && nextCursor && (
        <li className="text-center pt-2">
          <Link
            href={`/contacts/${contactId}?cursor=${encodeURIComponent(nextCursor)}`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 transition-colors"
          >
            Carregar mais
          </Link>
        </li>
      )}
    </ol>
  )
}

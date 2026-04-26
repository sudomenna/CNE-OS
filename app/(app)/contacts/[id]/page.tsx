import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  contact,
  contactPhone,
  contactEmail,
  contactTag,
  contactCustomField,
} from '@/lib/db/schema/contact'
import { brand } from '@/lib/db/schema/organization'
import { funnelEntry, funnel, funnelStage } from '@/lib/db/schema/funnel'
import { ticket } from '@/lib/db/schema/ticket'
import { requireSession } from '@/lib/auth/session'
import { getPrimaryAddress } from '@/lib/domain/contact/address'
import { listTimelineEvents } from '@/lib/timeline/read'
import { ContactHeader } from '@/components/contact/contact-header'
import { ContactTabs } from '@/components/contact/contact-tabs'
import { TimelineRealtimeTrigger } from '@/components/contact/timeline-realtime-trigger'
import { TabConversations } from '@/components/contact/tab-conversations'
import { TabTickets, type TicketRow } from '@/components/contact/tab-tickets'
import { TabOpportunities, type OpportunityRow } from '@/components/contact/tab-opportunities'
import { TabTransactions } from '@/components/contact/tab-transactions'
import { TabEntitlements } from '@/components/contact/tab-entitlements'
import { TabNotes } from '@/components/contact/tab-notes'
import { TabAudit } from '@/components/contact/tab-audit'

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
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function ContactDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { cursor } = await searchParams

  // -------------------------------------------------------------------------
  // 1. Auth: buscar sessão para obter currentUserId e role
  // -------------------------------------------------------------------------
  const session = await requireSession()
  const currentUserId = session.user.id
  const currentUserRole = session.user.role

  // -------------------------------------------------------------------------
  // 2. Fetch contact data (incluindo emails, phones, tags, brand associations)
  //    + tabs de oportunidades e tickets (para passar como props aos Client Components)
  // -------------------------------------------------------------------------
  const [contactRows, phones, emails, tags, brandLinks, opportunityRows, ticketRows] = await Promise.all([
    db.select().from(contact).where(eq(contact.id, id)).limit(1),
    db.select().from(contactPhone).where(eq(contactPhone.contactId, id)),
    db.select().from(contactEmail).where(eq(contactEmail.contactId, id)),
    db.select().from(contactTag).where(eq(contactTag.contactId, id)),
    // brand_ids associados via contact_custom_field WHERE key='brand_id'
    db
      .select({ brandId: contactCustomField.brandId, brandName: brand.name })
      .from(contactCustomField)
      .innerJoin(
        brand,
        and(
          eq(contactCustomField.brandId, brand.id),
          isNull(brand.deletedAt),
        ),
      )
      .where(
        and(
          eq(contactCustomField.contactId, id),
          eq(contactCustomField.key, 'brand_id'),
        ),
      ),
    // Oportunidades: funnel_entry JOIN funnel + funnel_stage
    db
      .select({
        entryId:         funnelEntry.id,
        funnelId:        funnelEntry.funnelId,
        label:           funnelEntry.label,
        score:           funnelEntry.score,
        entryCampaignId: funnelEntry.entryCampaignId,
        createdAt:       funnelEntry.createdAt,
        funnelName:      funnel.name,
        stageName:       funnelStage.name,
      })
      .from(funnelEntry)
      .innerJoin(funnel,      eq(funnelEntry.funnelId,       funnel.id))
      .innerJoin(funnelStage, eq(funnelEntry.currentStageId, funnelStage.id))
      .where(eq(funnelEntry.contactId, id))
      .orderBy(desc(funnelEntry.createdAt))
      .limit(50),
    // Tickets do contato
    db
      .select({
        id:             ticket.id,
        title:          ticket.title,
        category:       ticket.category,
        priority:       ticket.priority,
        status:         ticket.status,
        assignedUserId: ticket.assignedUserId,
        createdAt:      ticket.createdAt,
      })
      .from(ticket)
      .where(and(eq(ticket.contactId, id), isNull(ticket.deletedAt)))
      .orderBy(desc(ticket.createdAt))
      .limit(50),
  ])

  const contactRow = contactRows[0]
  if (!contactRow) {
    notFound()
  }

  // -------------------------------------------------------------------------
  // 3. Fetch timeline (first page) para a aba Timeline
  // -------------------------------------------------------------------------
  let timelinePage = {
    events: [] as Awaited<ReturnType<typeof listTimelineEvents>>['events'],
    nextCursor: null as string | null,
    hasMore: false,
  }
  try {
    timelinePage = await listTimelineEvents(id, {}, cursor ?? null, 20)
  } catch {
    // non-fatal — timeline pode estar vazia
  }

  // -------------------------------------------------------------------------
  // 4. Preparar props do ContactHeader
  // -------------------------------------------------------------------------
  const primaryPhone = phones.find((p) => p.status === 'primary') ?? phones[0]
  const primaryEmail = emails.find((e) => e.status === 'primary') ?? emails[0]
  const phoneList = primaryPhone
    ? [{ e164: primaryPhone.e164, isWhatsapp: primaryPhone.whatsappCheckedAt !== null }]
    : []
  const emailList = primaryEmail ? [primaryEmail.email] : []
  const tagList = tags.map((t) => t.tag)
  const brandNames = brandLinks.map((b) => b.brandName)

  // Endereço primário (kind='home') — modelo estruturado em contact_address
  // BR-IDENTITY (estendida): substitui workaround anterior que vivia em contact_custom_field
  const primaryAddress = await getPrimaryAddress(id, 'home')
  const address = primaryAddress
    ? {
        city: primaryAddress.city,
        state: primaryAddress.state,
        zip: primaryAddress.zip,
      }
    : { city: null, state: null, zip: null }

  // -------------------------------------------------------------------------
  // 5. Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Back link */}
      <nav aria-label="Navegacao de retorno">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <span aria-hidden="true">&larr;</span> Contatos
        </Link>
      </nav>

      {/* Contact header rico */}
      <ContactHeader
        contactId={id}
        name={contactRow.fullName}
        classification={contactRow.classification}
        cpf={contactRow.cpf ?? null}
        emails={emailList}
        phones={phoneList}
        tags={tagList}
        brandNames={brandNames}
        currentUserRole={currentUserRole}
        address={address}
      />

      {/* 8 Tabs */}
      <ContactTabs
        timelineContent={
          <Suspense
            fallback={
              <div className="py-8 text-center text-sm text-muted-foreground">
                Carregando timeline...
              </div>
            }
          >
            <TimelinePanel
              events={timelinePage.events}
              hasMore={timelinePage.hasMore}
              nextCursor={timelinePage.nextCursor}
              contactId={id}
            />
          </Suspense>
        }
        conversasContent={
          <Suspense
            fallback={
              <div className="py-8 text-center text-sm text-muted-foreground">
                Carregando conversas...
              </div>
            }
          >
            <TabConversations contactId={id} />
          </Suspense>
        }
        ticketsContent={
          <TabTickets
            contactId={id}
            userId={currentUserId}
            rows={ticketRows as TicketRow[]}
          />
        }
        oportunidadesContent={
          <TabOpportunities
            contactId={id}
            userId={currentUserId}
            rows={opportunityRows as OpportunityRow[]}
          />
        }
        transacoesContent={
          <Suspense
            fallback={
              <div className="py-8 text-center text-sm text-muted-foreground">
                Carregando transacoes...
              </div>
            }
          >
            <TabTransactions contactId={id} />
          </Suspense>
        }
        direitosContent={
          <Suspense
            fallback={
              <div className="py-8 text-center text-sm text-muted-foreground">
                Carregando direitos...
              </div>
            }
          >
            <TabEntitlements contactId={id} />
          </Suspense>
        }
        notasContent={
          <TabNotes contactId={id} currentUserId={currentUserId} />
        }
        historicoContent={
          <Suspense
            fallback={
              <div className="py-8 text-center text-sm text-muted-foreground">
                Carregando historico...
              </div>
            }
          >
            <TabAudit contactId={id} />
          </Suspense>
        }
      />
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
  return (
    <>
      {/* T-13-23: subscription Supabase Realtime — router.refresh() ao INSERT */}
      <TimelineRealtimeTrigger contactId={contactId} />

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground/60">Nenhum evento na timeline.</p>
        </div>
      ) : (
        <ol className="space-y-3" aria-label="Timeline de eventos">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              {/* Kind dot */}
              <div
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40"
                aria-hidden="true"
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground capitalize">
                  {kindLabel(event.kind)}
                </p>
                {payloadSummary(event.payload) && (
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    {payloadSummary(event.payload)}
                  </p>
                )}
              </div>

              {/* Date */}
              <time
                dateTime={new Date(event.occurredAt).toISOString()}
                className="shrink-0 text-xs text-muted-foreground/60 whitespace-nowrap"
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
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              >
                Carregar mais
              </Link>
            </li>
          )}
        </ol>
      )}
    </>
  )
}

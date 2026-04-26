/**
 * TabConversations — Server Component
 * Exibe lista de conversas vinculadas a um contato.
 *
 * Parte de: T-12-09 — Contact: Tab Conversas
 * Spec: docs/20-domain/02-contact-identity.md
 * Schema: lib/db/schema/conversation.ts
 *
 * NÃO acessa Server Action — é Server Component com acesso direto ao db,
 * conforme permitido pelo padrão de páginas em app/(app)/contacts/[id]/page.tsx
 */

import Link from 'next/link'
import type { Route } from 'next'
import { eq, desc, isNull, and } from 'drizzle-orm'
import { MessageSquare, Mail, Globe, AtSign } from 'lucide-react'

import { db } from '@/lib/db/client'
import {
  conversation,
  channelAccount,
  channel,
} from '@/lib/db/schema/conversation'
import { userAccount } from '@/lib/db/schema/organization'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TabConversationsProps {
  contactId: string
}

// Tipo inferido da query — alinha com o schema real
type ConversationRow = {
  id: string
  status: 'open' | 'waiting_customer' | 'waiting_team' | 'closed'
  updatedAt: Date
  assignedUserFullName: string | null
  channelKind: 'whatsapp' | 'instagram' | 'email' | null
}

// ---------------------------------------------------------------------------
// Helpers: canal → ícone
// ---------------------------------------------------------------------------

function ChannelIcon({ kind }: { kind: ConversationRow['channelKind'] }) {
  const props = { size: 14, 'aria-hidden': true as const, className: 'shrink-0' }
  switch (kind) {
    case 'whatsapp':
      return <MessageSquare {...props} />
    case 'instagram':
      return <AtSign {...props} />
    case 'email':
      return <Mail {...props} />
    default:
      return <Globe {...props} />
  }
}

const CHANNEL_LABELS: Record<NonNullable<ConversationRow['channelKind']>, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
}

function channelLabel(kind: ConversationRow['channelKind']): string {
  if (!kind) return 'Canal'
  return CHANNEL_LABELS[kind]
}

// ---------------------------------------------------------------------------
// Helpers: status → badge variant + label
// ---------------------------------------------------------------------------

type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const STATUS_LABELS: Record<ConversationRow['status'], string> = {
  open: 'Aberta',
  waiting_customer: 'Aguardando cliente',
  waiting_team: 'Aguardando equipe',
  closed: 'Fechada',
}

function statusVariant(status: ConversationRow['status']): StatusVariant {
  switch (status) {
    case 'open':
      return 'default'       // verde via Tailwind no badge padrão
    case 'waiting_customer':
    case 'waiting_team':
      return 'secondary'     // amarelado — neutro
    case 'closed':
      return 'outline'       // cinza discreto
  }
}

function statusClass(status: ConversationRow['status']): string {
  switch (status) {
    case 'open':
      return 'border-transparent bg-emerald-100 text-emerald-800'
    case 'waiting_customer':
    case 'waiting_team':
      return 'border-transparent bg-amber-100 text-amber-800'
    case 'closed':
      return 'border-border text-muted-foreground'
  }
}

// ---------------------------------------------------------------------------
// Helpers: data relativa
// ---------------------------------------------------------------------------

/**
 * Formata data como "há X min/h/d" usando Intl.RelativeTimeFormat.
 * Executado em servidor — usa locale pt-BR.
 */
function relativeTime(date: Date): string {
  const diffMs = date.getTime() - Date.now()
  const diffSec = Math.round(diffMs / 1_000)
  const diffMin = Math.round(diffSec / 60)
  const diffHour = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHour / 24)

  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second')
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour')
  return rtf.format(diffDay, 'day')
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchConversations(contactId: string): Promise<ConversationRow[]> {
  const rows = await db
    .select({
      id: conversation.id,
      status: conversation.status,
      updatedAt: conversation.updatedAt,
      assignedUserFullName: userAccount.fullName,
      channelKind: channel.kind,
    })
    .from(conversation)
    .leftJoin(channelAccount, eq(conversation.channelAccountId, channelAccount.id))
    .leftJoin(channel, eq(channelAccount.channelId, channel.id))
    .leftJoin(userAccount, eq(conversation.assignedUserId, userAccount.id))
    .where(
      and(
        eq(conversation.contactId, contactId),
        isNull(conversation.deletedAt),
      ),
    )
    .orderBy(desc(conversation.updatedAt))
    .limit(50)

  return rows
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center"
      role="status"
      aria-label="Nenhuma conversa encontrada"
    >
      <MessageSquare
        size={32}
        className="text-muted-foreground/40"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">
        Nenhuma conversa encontrada
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Conversation row
// ---------------------------------------------------------------------------

function ConversationItem({ row }: { row: ConversationRow }) {
  const href = `/inbox?conversation=${row.id}` as Route

  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Conversa ${channelLabel(row.channelKind)} — ${STATUS_LABELS[row.status]}`}
      >
        {/* Canal — ícone + badge */}
        <span
          className="flex items-center gap-1.5 text-muted-foreground"
          aria-label={`Canal: ${channelLabel(row.channelKind)}`}
        >
          <ChannelIcon kind={row.channelKind} />
          <span className="hidden sm:inline text-xs">{channelLabel(row.channelKind)}</span>
        </span>

        {/* Responsável */}
        <span className="flex-1 truncate text-xs text-muted-foreground">
          {row.assignedUserFullName ?? (
            <span className="italic">Sem responsável</span>
          )}
        </span>

        {/* Status badge */}
        <Badge
          variant={statusVariant(row.status)}
          className={statusClass(row.status)}
          aria-label={`Status: ${STATUS_LABELS[row.status]}`}
        >
          {STATUS_LABELS[row.status]}
        </Badge>

        {/* Última atualização */}
        <time
          dateTime={row.updatedAt.toISOString()}
          className="shrink-0 text-xs text-muted-foreground/60 whitespace-nowrap"
          title={row.updatedAt.toLocaleString('pt-BR')}
        >
          {relativeTime(row.updatedAt)}
        </time>
      </Link>
    </li>
  )
}

// ---------------------------------------------------------------------------
// TabConversations — named export (Server Component)
// ---------------------------------------------------------------------------

export async function TabConversations({ contactId }: TabConversationsProps) {
  const rows = await fetchConversations(contactId)

  if (rows.length === 0) {
    return <EmptyState />
  }

  return (
    <section aria-label="Conversas do contato">
      <ol className="space-y-2" aria-label="Lista de conversas">
        {rows.map((row) => (
          <ConversationItem key={row.id} row={row} />
        ))}
      </ol>
    </section>
  )
}

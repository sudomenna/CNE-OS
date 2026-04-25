/**
 * ConversationList — coluna esquerda do inbox (lista de conversas abertas).
 *
 * Server Component. Lista conversas com status != 'closed'.
 * Seleção via link ?conversation=<id>.
 *
 * docs/20-domain/05-conversation-inbox.md §3
 * docs/80-roadmap/02-sprint-3-4-inbox-tickets.md (T-3-11)
 */

import Link from 'next/link'
import type { Route } from 'next'
import { and, desc, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  conversation,
  channel,
  channelAccount,
} from '@/lib/db/schema/conversation'
import { contact } from '@/lib/db/schema/contact'
import { eq, isNull } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

type ConversationStatus = 'open' | 'waiting_customer' | 'waiting_team' | 'closed'
type ChannelKind = 'whatsapp' | 'instagram' | 'email'

const STATUS_LABELS: Record<ConversationStatus, string> = {
  open: 'Aberta',
  waiting_customer: 'Aguardando cliente',
  waiting_team: 'Aguardando equipe',
  closed: 'Encerrada',
}

const STATUS_BADGE: Record<ConversationStatus, string> = {
  open: 'bg-emerald-50 text-emerald-700',
  waiting_customer: 'bg-amber-50 text-amber-700',
  waiting_team: 'bg-sky-50 text-sky-700',
  closed: 'bg-muted text-muted-foreground',
}

const CHANNEL_ICON: Record<ChannelKind, string> = {
  whatsapp: 'WA',
  instagram: 'IG',
  email: 'EM',
}

const CHANNEL_ICON_CLASS: Record<ChannelKind, string> = {
  whatsapp: 'bg-green-500 text-white',
  instagram: 'bg-pink-500 text-white',
  email: 'bg-blue-500 text-white',
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

interface ConversationListProps {
  selectedId?: string | undefined
}

export async function ConversationList({ selectedId }: ConversationListProps) {
  // Busca conversas ativas com último preview de mensagem
  const rows = await db
    .select({
      id: conversation.id,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      contactId: conversation.contactId,
      contactName: contact.fullName,
      channelKind: channel.kind,
      channelName: channel.name,
      // Último preview via subquery de MAX createdAt
      lastMessageBody: sql<string | null>`(
        SELECT body FROM message
        WHERE conversation_id = ${conversation.id}
        ORDER BY created_at DESC
        LIMIT 1
      )`,
    })
    .from(conversation)
    .innerJoin(contact, eq(contact.id, conversation.contactId))
    .innerJoin(channelAccount, eq(channelAccount.id, conversation.channelAccountId))
    .innerJoin(channel, eq(channel.id, channelAccount.channelId))
    .where(
      and(
        ne(conversation.status, 'closed'),
        isNull(conversation.deletedAt),
      ),
    )
    .orderBy(desc(conversation.lastMessageAt))
    .limit(100)

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-muted-foreground/60 text-sm">
        <p>Nenhuma conversa ativa.</p>
      </div>
    )
  }

  return (
    <nav aria-label="Lista de conversas" className="flex flex-col divide-y divide-border">
      {rows.map((conv) => {
        const isSelected = conv.id === selectedId
        const initials = getInitials(conv.contactName)
        const channelKind = conv.channelKind as ChannelKind
        const status = conv.status as ConversationStatus

        return (
          <Link
            key={conv.id}
            href={`/inbox?conversation=${conv.id}` as Route}
            aria-label={`Conversa com ${conv.contactName} via ${conv.channelName}`}
            aria-current={isSelected ? 'page' : undefined}
            className={[
              'flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              isSelected ? 'bg-muted' : '',
            ].join(' ')}
          >
            {/* Avatar com iniciais */}
            <div
              aria-hidden="true"
              className="flex-shrink-0 h-9 w-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold"
            >
              {initials}
            </div>

            {/* Conteúdo principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium text-foreground truncate">
                  {conv.contactName}
                </span>
                <span className="flex-shrink-0 text-xs text-muted-foreground/60">
                  {formatRelativeTime(conv.lastMessageAt)}
                </span>
              </div>

              {/* Preview da última mensagem */}
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {conv.lastMessageBody ?? 'Sem mensagens'}
              </p>

              {/* Canal + Status */}
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  aria-label={`Canal ${conv.channelName}`}
                  className={[
                    'inline-flex items-center justify-center rounded px-1 py-0.5 text-[10px] font-bold leading-none',
                    CHANNEL_ICON_CLASS[channelKind] ?? 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {CHANNEL_ICON[channelKind] ?? channelKind.toUpperCase().slice(0, 2)}
                </span>
                <span
                  className={[
                    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    STATUS_BADGE[status] ?? 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {STATUS_LABELS[status]}
                </span>
              </div>
            </div>
          </Link>
        )
      })}
    </nav>
  )
}

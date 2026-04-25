/**
 * ContactPane — coluna direita do inbox (dados do contato da conversa selecionada).
 *
 * Server Component. Carrega dados do contato e exibe:
 * - Nome, CPF mascarado, status
 * - Botao "Atribuir a mim" e dropdown de status via ConversationStatusSelect
 *
 * docs/20-domain/05-conversation-inbox.md §3
 * docs/80-roadmap/02-sprint-3-4-inbox-tickets.md (T-3-11)
 */

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { conversation } from '@/lib/db/schema/conversation'
import { contact } from '@/lib/db/schema/contact'
import { userAccount } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { ConversationStatusSelect } from './conversation-status-select'
import { AssignToMeButton } from './assign-to-me-button'

type ConversationStatus = 'open' | 'waiting_customer' | 'waiting_team' | 'closed'

const CONTACT_STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  invalid: 'Invalido',
  blocked: 'Bloqueado',
}

function maskCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf
  return `***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

interface ContactPaneProps {
  conversationId?: string | undefined
}

export async function ContactPane({ conversationId }: ContactPaneProps) {
  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-muted-foreground/60 text-sm">
        <p>Selecione uma conversa para ver os dados do contato.</p>
      </div>
    )
  }

  // Carregar conversa + contato
  const rows = await db
    .select({
      conversationId: conversation.id,
      status: conversation.status,
      assignedUserId: conversation.assignedUserId,
      assignedUserName: userAccount.fullName,
      contactId: contact.id,
      contactName: contact.fullName,
      contactCpf: contact.cpf,
      contactStatus: contact.status,
      contactClassification: contact.classification,
    })
    .from(conversation)
    .innerJoin(contact, eq(contact.id, conversation.contactId))
    .leftJoin(userAccount, eq(userAccount.id, conversation.assignedUserId))
    .where(eq(conversation.id, conversationId))
    .limit(1)

  const row = rows[0]

  if (!row) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-muted-foreground/60 text-sm">
        <p>Conversa nao encontrada.</p>
      </div>
    )
  }

  // Carregar o userId da sessão atual para o AssignToMeButton
  let currentUserId: string | null = null
  try {
    const ctx = await requireSession()
    currentUserId = ctx.user.id
  } catch {
    // Sem sessao — nao exibe o botao de atribuir
  }

  const initials = row.contactName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0]!.toUpperCase())
    .join('')

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Avatar + nome */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <div
          aria-hidden="true"
          className="h-14 w-14 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-lg font-semibold"
        >
          {initials}
        </div>
        <h2 className="text-sm font-semibold text-foreground text-center">
          {row.contactName}
        </h2>
        <span className="text-xs text-muted-foreground">
          {CONTACT_STATUS_LABELS[row.contactStatus] ?? row.contactStatus}
        </span>
      </div>

      {/* Dados do contato */}
      <section aria-label="Dados do contato">
        <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-2">
          Contato
        </h3>
        <dl className="space-y-1.5 text-sm">
          {row.contactCpf && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">CPF</dt>
              <dd className="font-mono text-muted-foreground">{maskCpf(row.contactCpf)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Classificacao</dt>
            <dd className="text-muted-foreground capitalize">{row.contactClassification}</dd>
          </div>
        </dl>
      </section>

      {/* Status da conversa */}
      <section aria-label="Status da conversa">
        <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-2">
          Status da conversa
        </h3>
        <ConversationStatusSelect
          conversationId={conversationId}
          currentStatus={row.status as ConversationStatus}
        />
      </section>

      {/* Responsavel */}
      <section aria-label="Responsavel pela conversa">
        <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-2">
          Responsavel
        </h3>
        <p className="text-sm text-muted-foreground mb-2">
          {row.assignedUserName ?? (
            <span className="text-muted-foreground/60">Nao atribuida</span>
          )}
        </p>
        {currentUserId && row.assignedUserId !== currentUserId && (
          <AssignToMeButton
            conversationId={conversationId}
            currentUserId={currentUserId}
          />
        )}
      </section>
    </div>
  )
}

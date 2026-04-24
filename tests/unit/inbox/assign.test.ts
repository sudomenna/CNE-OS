/**
 * Testes unitários — assignConversation
 *
 * BR-INBOX-CONVERSATION §4: responsável é da conversa, não do contato.
 * INV-INBOX-06: cada mudança de assigned_user_id gera linha em conversation_assignment_history.
 *
 * Estratégia: mockar @/lib/timeline/emit para isolar lógica de domínio.
 * A tx é um objeto mock que intercepta a chain Drizzle.
 *
 * docs/20-domain/05-conversation-inbox.md
 * docs/50-business-rules/BR-INBOX-CONVERSATION.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const CHANNEL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000010'
const USER_A_ID = '00000000-0000-0000-0000-000000000011'
const USER_B_ID = '00000000-0000-0000-0000-000000000012'
const MANAGER_ID = '00000000-0000-0000-0000-000000000013'

// ---------------------------------------------------------------------------
// Fixtures de conversa
// ---------------------------------------------------------------------------

const conversationAssignedToA = {
  id: CONVERSATION_ID,
  contactId: CONTACT_ID,
  channelAccountId: CHANNEL_ACCOUNT_ID,
  status: 'open' as const,
  assignedUserId: USER_A_ID,
}

const conversationUnassigned = {
  ...conversationAssignedToA,
  assignedUserId: null,
}

// ---------------------------------------------------------------------------
// Mock do emitTimelineEvent
// ---------------------------------------------------------------------------

const emitTimelineEventMock = vi.fn().mockResolvedValue({ id: 'te-1' })

vi.mock('@/lib/timeline/emit', () => ({
  emitTimelineEvent: emitTimelineEventMock,
}))

// ---------------------------------------------------------------------------
// Import dinâmico após mocks declarados
// ---------------------------------------------------------------------------

const { assignConversation } = await import('../../../lib/domain/inbox/assign')
const { ConversationNotFoundError } = await import('../../../lib/domain/inbox/errors')

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

type ConvRow = {
  id: string
  contactId: string
  channelAccountId: string
  status: string
  assignedUserId: string | null
}

function buildTxWithConversation(convRow: ConvRow | null) {
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(convRow ? [convRow] : []),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  }
  return tx
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-INBOX-CONVERSATION — assignConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: atribuição de conversa a usuário → registra histórico e emite evento ──

  describe('assign.assigns-conversation-to-user', () => {
    it(
      'given conversa atribuída a userA ' +
        'when assignConversation para userB ' +
        'then UPDATE assigned_user_id, INSERT conversation_assignment_history e emite conversation_assigned',
      async () => {
        const tx = buildTxWithConversation(conversationAssignedToA)

        await assignConversation(
          tx as unknown as Parameters<typeof assignConversation>[0],
          CONVERSATION_ID,
          USER_B_ID,
          MANAGER_ID,
        )

        // UPDATE deve ter sido chamado para atualizar assigned_user_id
        expect(tx.update).toHaveBeenCalledTimes(1)

        // INSERT deve ter sido chamado para conversation_assignment_history
        expect(tx.insert).toHaveBeenCalledTimes(1)

        // TE-CONVERSATION-ASSIGNED emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'conversation_assigned',
            source: 'MOD-INBOX',
            actorUserId: MANAGER_ID,
            payload: expect.objectContaining({
              conversation_id: CONVERSATION_ID,
              from_user_id: USER_A_ID,
              to_user_id: USER_B_ID,
              assigned_by_user_id: MANAGER_ID,
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: desatribuição (toUserId = null) → emite conversation_unassigned ──

  describe('assign.unassigns-conversation', () => {
    it(
      'given conversa atribuída a userA ' +
        'when assignConversation com toUserId=null ' +
        'then UPDATE assigned_user_id=null, INSERT history e emite conversation_unassigned',
      async () => {
        const tx = buildTxWithConversation(conversationAssignedToA)

        await assignConversation(
          tx as unknown as Parameters<typeof assignConversation>[0],
          CONVERSATION_ID,
          null,
          MANAGER_ID,
        )

        // TE-CONVERSATION-UNASSIGNED emitido (toUserId é null)
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'conversation_unassigned',
            source: 'MOD-INBOX',
            actorUserId: MANAGER_ID,
            payload: expect.objectContaining({
              to_user_id: null,
            }),
          }),
          tx,
        )

        // UPDATE e INSERT chamados
        expect(tx.update).toHaveBeenCalledTimes(1)
        expect(tx.insert).toHaveBeenCalledTimes(1)
      },
    )
  })

  // ── Caso 3: conversationId inexistente → lança ConversationNotFoundError ──

  describe('assign.conversation-not-found', () => {
    it(
      'given conversationId inexistente ' +
        'when assignConversation ' +
        'then lança ConversationNotFoundError sem UPDATE nem INSERT',
      async () => {
        const tx = buildTxWithConversation(null)

        await expect(
          assignConversation(
            tx as unknown as Parameters<typeof assignConversation>[0],
            '00000000-0000-0000-0000-000000000099',
            USER_B_ID,
            MANAGER_ID,
          ),
        ).rejects.toThrow(ConversationNotFoundError)

        // Nenhuma mutação
        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso extra: from_user_id = null na primeira atribuição ──────────────

  describe('assign.first-assignment-from-null', () => {
    it(
      'given conversa sem responsável (assignedUserId=null) ' +
        'when assignConversation para userB ' +
        'then INSERT history com from_user_id=null e emite conversation_assigned',
      async () => {
        const tx = buildTxWithConversation(conversationUnassigned)

        await assignConversation(
          tx as unknown as Parameters<typeof assignConversation>[0],
          CONVERSATION_ID,
          USER_B_ID,
          MANAGER_ID,
        )

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'conversation_assigned',
            payload: expect.objectContaining({
              from_user_id: null,
              to_user_id: USER_B_ID,
            }),
          }),
          tx,
        )
      },
    )
  })
})

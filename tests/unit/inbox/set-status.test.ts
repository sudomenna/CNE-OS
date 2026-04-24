/**
 * Testes unitários — setConversationStatus
 *
 * BR-INBOX-CONVERSATION §3: transições de status explícitas.
 * docs/20-domain/05-conversation-inbox.md §6: matriz de transições válidas.
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
const AGENT_ID = '00000000-0000-0000-0000-000000000011'

// ---------------------------------------------------------------------------
// Fixtures de conversa
// ---------------------------------------------------------------------------

function makeConversation(status: string) {
  return {
    id: CONVERSATION_ID,
    contactId: CONTACT_ID,
    channelAccountId: CHANNEL_ACCOUNT_ID,
    status,
    assignedUserId: null,
    externalThreadId: null,
    lastMessageAt: null,
    brandId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
  }
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

const { setConversationStatus } = await import('../../../lib/domain/inbox/set-status')
const { ConversationNotFoundError, InvalidConversationTransitionError } = await import(
  '../../../lib/domain/inbox/errors'
)

// ---------------------------------------------------------------------------
// Helper: cria mock de tx para o cenário com conversa existente
// ---------------------------------------------------------------------------

function buildTxWithConversation(status: string) {
  const convRow = makeConversation(status)
  const updatedRow = { ...convRow, status: 'updated-via-mock' } // será sobrescrito pelo teste

  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([convRow]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedRow]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  }

  return { tx, convRow }
}

function buildTxNoConversation() {
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn(),
    insert: vi.fn(),
  }
  return tx
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-INBOX-CONVERSATION — setConversationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: open → closed → válido, emite conversation_closed ─────────

  describe('set-status.open-to-closed', () => {
    it(
      'given conversa com status=open ' +
        'when setConversationStatus para closed ' +
        'then UPDATE status, INSERT status_history e emite conversation_closed',
      async () => {
        const { tx } = buildTxWithConversation('open')

        const result = await setConversationStatus(
          tx as unknown as Parameters<typeof setConversationStatus>[0],
          CONVERSATION_ID,
          'closed',
          AGENT_ID,
          'Resolvido pelo atendente',
        )

        // Retorna conversa atualizada
        expect(result).toBeDefined()

        // UPDATE chamado para alterar status
        expect(tx.update).toHaveBeenCalledTimes(1)

        // INSERT chamado para conversation_status_history
        expect(tx.insert).toHaveBeenCalledTimes(1)

        // TE-CONVERSATION-CLOSED emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'conversation_closed',
            source: 'MOD-INBOX',
            actorUserId: AGENT_ID,
            payload: expect.objectContaining({
              from_status: 'open',
              to_status: 'closed',
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: open → waiting_customer → válido, emite conversation_status_changed ──

  describe('set-status.open-to-waiting-customer', () => {
    it(
      'given conversa com status=open ' +
        'when setConversationStatus para waiting_customer ' +
        'then UPDATE status, INSERT status_history e emite conversation_status_changed',
      async () => {
        const { tx } = buildTxWithConversation('open')

        const result = await setConversationStatus(
          tx as unknown as Parameters<typeof setConversationStatus>[0],
          CONVERSATION_ID,
          'waiting_customer',
          AGENT_ID,
        )

        expect(result).toBeDefined()

        expect(tx.update).toHaveBeenCalledTimes(1)
        expect(tx.insert).toHaveBeenCalledTimes(1)

        // TE-CONVERSATION-STATUS-CHANGED emitido (não é closed nem reopened)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'conversation_status_changed',
            source: 'MOD-INBOX',
            payload: expect.objectContaining({
              from_status: 'open',
              to_status: 'waiting_customer',
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 3: closed → open → reabertura manual, emite conversation_reopened ─

  describe('set-status.closed-to-open', () => {
    it(
      'given conversa com status=closed ' +
        'when setConversationStatus para open ' +
        'then UPDATE status, INSERT status_history e emite conversation_reopened',
      async () => {
        const { tx } = buildTxWithConversation('closed')

        const result = await setConversationStatus(
          tx as unknown as Parameters<typeof setConversationStatus>[0],
          CONVERSATION_ID,
          'open',
          AGENT_ID,
          'Reabertura manual pelo atendente',
        )

        expect(result).toBeDefined()

        // TE-CONVERSATION-REOPENED emitido (closed → open)
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'conversation_reopened',
            source: 'MOD-INBOX',
            actorUserId: AGENT_ID,
            payload: expect.objectContaining({
              from_status: 'closed',
              to_status: 'open',
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 4: closed → waiting_customer → transição inválida ─────────────

  describe('set-status.closed-to-waiting-customer-invalid', () => {
    it(
      'given conversa com status=closed ' +
        'when setConversationStatus para waiting_customer ' +
        'then lança InvalidConversationTransitionError sem mutações',
      async () => {
        const { tx } = buildTxWithConversation('closed')

        await expect(
          setConversationStatus(
            tx as unknown as Parameters<typeof setConversationStatus>[0],
            CONVERSATION_ID,
            'waiting_customer',
            AGENT_ID,
          ),
        ).rejects.toThrow(InvalidConversationTransitionError)

        // Nenhuma mutação deve ter ocorrido
        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 5: closed → waiting_team → transição inválida (outra variação) ─

  describe('set-status.closed-to-waiting-team-invalid', () => {
    it(
      'given conversa com status=closed ' +
        'when setConversationStatus para waiting_team ' +
        'then lança InvalidConversationTransitionError',
      async () => {
        const { tx } = buildTxWithConversation('closed')

        await expect(
          setConversationStatus(
            tx as unknown as Parameters<typeof setConversationStatus>[0],
            CONVERSATION_ID,
            'waiting_team',
            AGENT_ID,
          ),
        ).rejects.toThrow(InvalidConversationTransitionError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 6: conversa não encontrada → lança ConversationNotFoundError ───

  describe('set-status.conversation-not-found', () => {
    it(
      'given conversationId inexistente ' +
        'when setConversationStatus ' +
        'then lança ConversationNotFoundError sem mutações',
      async () => {
        const tx = buildTxNoConversation()

        await expect(
          setConversationStatus(
            tx as unknown as Parameters<typeof setConversationStatus>[0],
            '00000000-0000-0000-0000-000000000099',
            'closed',
            AGENT_ID,
          ),
        ).rejects.toThrow(ConversationNotFoundError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso extra: open → waiting_team → válido ────────────────────────────

  describe('set-status.open-to-waiting-team', () => {
    it(
      'given conversa com status=open ' +
        'when setConversationStatus para waiting_team ' +
        'then transição válida, emite conversation_status_changed',
      async () => {
        const { tx } = buildTxWithConversation('open')

        await setConversationStatus(
          tx as unknown as Parameters<typeof setConversationStatus>[0],
          CONVERSATION_ID,
          'waiting_team',
          AGENT_ID,
        )

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'conversation_status_changed',
            payload: expect.objectContaining({
              from_status: 'open',
              to_status: 'waiting_team',
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso extra: waiting_team → closed → válido, emite conversation_closed ─

  describe('set-status.waiting-team-to-closed', () => {
    it(
      'given conversa com status=waiting_team ' +
        'when setConversationStatus para closed ' +
        'then transição válida, emite conversation_closed',
      async () => {
        const { tx } = buildTxWithConversation('waiting_team')

        await setConversationStatus(
          tx as unknown as Parameters<typeof setConversationStatus>[0],
          CONVERSATION_ID,
          'closed',
          AGENT_ID,
        )

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'conversation_closed',
          }),
          tx,
        )
      },
    )
  })
})

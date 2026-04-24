/**
 * Testes unitários — openOrReopenConversation
 *
 * BR-INBOX-CONVERSATION: 3 casos conforme task T-3-05
 *
 * Estratégia: mockar @/lib/db/client e @/lib/timeline/emit para isolar
 * a lógica de domínio. A tx é um objeto mock que intercepta a chain Drizzle.
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
const ACTOR_SYSTEM = 'whatsapp-webhook'

// ---------------------------------------------------------------------------
// Fixtures de conversa
// ---------------------------------------------------------------------------

const openConversation = {
  id: CONVERSATION_ID,
  contactId: CONTACT_ID,
  channelAccountId: CHANNEL_ACCOUNT_ID,
  status: 'open' as const,
  assignedUserId: null,
  externalThreadId: null,
  lastMessageAt: null,
  brandId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
}

const closedConversation = {
  ...openConversation,
  status: 'closed' as const,
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

const { openOrReopenConversation } = await import('../../../lib/domain/inbox/open-or-reopen')

// ---------------------------------------------------------------------------
// Helper: cria mock de tx para o cenário de "nenhuma conversa existente"
// ---------------------------------------------------------------------------

function buildTxNoConversation() {
  const insertedRows: Record<string, unknown>[] = []

  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]), // sem conversa ativa nem fechada
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([openConversation]),
      }),
    }),
    _insertedRows: insertedRows,
  }

  return tx
}

// ---------------------------------------------------------------------------
// Helper: cria mock de tx para o cenário de "conversa ativa existente"
// ---------------------------------------------------------------------------

function buildTxActiveConversation() {
  // Primeira chamada ao select retorna a conversa ativa (ne status closed)
  const tx = {
    _selectCallCount: 0,
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([openConversation]),
      }),
    }),
    update: vi.fn(),
    insert: vi.fn(),
  }
  return tx
}

// ---------------------------------------------------------------------------
// Helper: cria mock de tx para o cenário de "conversa fechada" (reabertura)
// ---------------------------------------------------------------------------

function buildTxClosedConversation() {
  let selectCallCount = 0

  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          selectCallCount++
          if (selectCallCount === 1) {
            // Primeira chamada: busca conversa ativa → nenhuma
            return Promise.resolve([])
          }
          // Segunda chamada: busca conversa fechada → retorna a fechada
          return Promise.resolve([closedConversation])
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...closedConversation, status: 'open' }]),
        }),
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

describe('BR-INBOX-CONVERSATION — openOrReopenConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: conversa não existe → cria, emite conversation_opened ─────────

  describe('open.creates-new-conversation', () => {
    it(
      'given par (contactId, channelAccountId) sem conversa existente ' +
        'when openOrReopenConversation ' +
        'then INSERT conversa, INSERT status_history e emite conversation_opened',
      async () => {
        const tx = buildTxNoConversation()

        const result = await openOrReopenConversation(
          tx as unknown as Parameters<typeof openOrReopenConversation>[0],
          {
            contactId: CONTACT_ID,
            channelAccountId: CHANNEL_ACCOUNT_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )

        // Retorna a conversa criada
        expect(result.id).toBe(CONVERSATION_ID)
        expect(result.status).toBe('open')
        expect(result.contactId).toBe(CONTACT_ID)
        expect(result.channelAccountId).toBe(CHANNEL_ACCOUNT_ID)

        // INSERT deve ter sido chamado (conversa + status_history)
        expect(tx.insert).toHaveBeenCalledTimes(2)

        // TE-CONVERSATION-OPENED emitido uma vez
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'conversation_opened',
            source: 'MOD-INBOX',
            actorSystem: ACTOR_SYSTEM,
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: conversa existe open → retorna sem emitir evento ──────────────

  describe('open.idempotent-when-already-active', () => {
    it(
      'given conversa com status=open para o par ' +
        'when openOrReopenConversation ' +
        'then retorna conversa existente sem INSERT nem emitir evento',
      async () => {
        const tx = buildTxActiveConversation()

        const result = await openOrReopenConversation(
          tx as unknown as Parameters<typeof openOrReopenConversation>[0],
          {
            contactId: CONTACT_ID,
            channelAccountId: CHANNEL_ACCOUNT_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )

        // Retorna a conversa existente
        expect(result.id).toBe(CONVERSATION_ID)
        expect(result.status).toBe('open')

        // Nenhum INSERT — idempotente
        expect(tx.insert).not.toHaveBeenCalled()

        // Nenhum UPDATE
        expect(tx.update).not.toHaveBeenCalled()

        // Nenhum evento emitido
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 3: conversa fechada → reabre, emite conversation_reopened ────────

  describe('reopen.reopens-closed-conversation', () => {
    it(
      'given conversa com status=closed para o par ' +
        'when openOrReopenConversation ' +
        'then UPDATE status=open, INSERT status_history e emite conversation_reopened',
      async () => {
        const tx = buildTxClosedConversation()

        const result = await openOrReopenConversation(
          tx as unknown as Parameters<typeof openOrReopenConversation>[0],
          {
            contactId: CONTACT_ID,
            channelAccountId: CHANNEL_ACCOUNT_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )

        // Retorna conversa reaberta com status='open'
        expect(result.status).toBe('open')

        // UPDATE chamado para alterar status
        expect(tx.update).toHaveBeenCalledTimes(1)

        // INSERT chamado para conversation_status_history
        expect(tx.insert).toHaveBeenCalledTimes(1)

        // TE-CONVERSATION-REOPENED emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'conversation_reopened',
            source: 'MOD-INBOX',
            actorSystem: ACTOR_SYSTEM,
          }),
          tx,
        )
      },
    )
  })

  // ── Caso extra: waiting_customer → retorna sem efeitos (ainda ativa) ──────

  describe('open.idempotent-when-waiting-customer', () => {
    it(
      'given conversa com status=waiting_customer para o par ' +
        'when openOrReopenConversation ' +
        'then retorna conversa existente sem eventos adicionais',
      async () => {
        const waitingConversation = { ...openConversation, status: 'waiting_customer' as const }

        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([waitingConversation]),
            }),
          }),
          update: vi.fn(),
          insert: vi.fn(),
        }

        const result = await openOrReopenConversation(
          tx as unknown as Parameters<typeof openOrReopenConversation>[0],
          {
            contactId: CONTACT_ID,
            channelAccountId: CHANNEL_ACCOUNT_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )

        expect(result.status).toBe('waiting_customer')
        expect(tx.insert).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })
})

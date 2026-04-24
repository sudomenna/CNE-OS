/**
 * Testes unitários — appendMessage
 *
 * BR-INBOX-CONVERSATION + BR-INTEGRATION-IDEMPOTENCY: 3 casos conforme task T-3-05
 *
 * Estratégia: mockar @/lib/db/client e @/lib/timeline/emit para isolar
 * a lógica de domínio. A tx é um objeto mock que intercepta a chain Drizzle.
 *
 * docs/20-domain/05-conversation-inbox.md
 * docs/50-business-rules/BR-INBOX-CONVERSATION.md
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const CHANNEL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000010'
const MESSAGE_ID = '00000000-0000-0000-0000-000000000020'
const ACTOR_SYSTEM = 'whatsapp-webhook'
const EXTERNAL_MSG_ID = 'wamid.ext123abc'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const openConversationRow = {
  id: CONVERSATION_ID,
  contactId: CONTACT_ID,
  channelAccountId: CHANNEL_ACCOUNT_ID,
  status: 'open' as const,
  assignedUserId: null,
}

const closedConversationRow = {
  ...openConversationRow,
  status: 'closed' as const,
}

const messageRow = {
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  direction: 'inbound',
  body: 'Olá, tudo bem?',
  externalMessageId: EXTERNAL_MSG_ID,
  actorUserId: null,
  actorSystem: ACTOR_SYSTEM,
  sentAt: null,
  createdAt: new Date('2026-01-01T12:00:00Z'),
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

const { appendMessage } = await import('../../../lib/domain/inbox/append-message')
const { ConversationNotFoundError, ConversationClosedError } = await import(
  '../../../lib/domain/inbox/errors'
)

// ---------------------------------------------------------------------------
// Helper: cria mock de tx base (conversa open, insert retorna mensagem)
// ---------------------------------------------------------------------------

function buildTxOpenConversation(messageOverride?: Record<string, unknown>) {
  const returnedMessage = { ...messageRow, ...messageOverride }

  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([openConversationRow]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([returnedMessage]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  }

  return tx
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-INBOX-CONVERSATION + BR-INTEGRATION-IDEMPOTENCY — appendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: nova mensagem inbound → inserta, emite message_inbound ────────

  describe('append.inbound-new-message', () => {
    it(
      'given conversa open e nova mensagem inbound ' +
        'when appendMessage ' +
        'then INSERT mensagem, UPDATE last_message_at e emite message_inbound',
      async () => {
        const tx = buildTxOpenConversation()

        const result = await appendMessage(
          tx as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'inbound',
            body: 'Olá, tudo bem?',
            externalMessageId: EXTERNAL_MSG_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )

        // Retorna mensagem inserida
        expect(result.id).toBe(MESSAGE_ID)
        expect(result.direction).toBe('inbound')
        expect(result.body).toBe('Olá, tudo bem?')

        // INSERT chamado (mensagem)
        expect(tx.insert).toHaveBeenCalledTimes(1)

        // UPDATE chamado (last_message_at)
        expect(tx.update).toHaveBeenCalledTimes(1)

        // TE-MESSAGE-INBOUND emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'message_inbound',
            source: 'MOD-INBOX',
            actorSystem: ACTOR_SYSTEM,
            payload: expect.objectContaining({
              conversation_id: CONVERSATION_ID,
              direction: 'inbound',
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: mesmo externalMessageId 2x → segunda retorna existente ────────

  describe('append.idempotent-by-external-id', () => {
    it(
      'given externalMessageId já persistido ' +
        'when appendMessage com mesmo externalMessageId ' +
        'then retorna mensagem existente sem INSERT adicional nem evento',
      async () => {
        // Simula violação de UNIQUE em uq_message_external
        const uniqueViolationError = new Error(
          'duplicate key value violates unique constraint "uq_message_external"',
        )

        let insertCallCount = 0

        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([openConversationRow]),
            }),
          }),
          insert: vi.fn().mockImplementation(() => {
            insertCallCount++
            return {
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockImplementation(() => {
                  throw uniqueViolationError
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }

        // Após a falha do INSERT, busca a mensagem existente via SELECT
        // O select é chamado 2x: primeiro para a conversa, depois para a mensagem existente
        let selectCallCount = 0
        tx.select.mockImplementation(() => {
          selectCallCount++
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(
                selectCallCount === 1
                  ? [openConversationRow]   // primeira chamada: conversa
                  : [messageRow],           // segunda chamada: mensagem existente
              ),
            }),
          }
        })

        const result = await appendMessage(
          tx as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'inbound',
            body: 'Mensagem duplicada',
            externalMessageId: EXTERNAL_MSG_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )

        // Retorna a mensagem existente
        expect(result.id).toBe(MESSAGE_ID)
        expect(result.externalMessageId).toBe(EXTERNAL_MSG_ID)

        // INSERT tentado 1x (falhou com unique violation)
        expect(insertCallCount).toBe(1)

        // UPDATE NÃO chamado (idempotência — sem efeitos adicionais)
        expect(tx.update).not.toHaveBeenCalled()

        // Nenhum evento emitido (idempotência)
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 3: outbound em conversa closed → lança ConversationClosedError ───

  describe('append.outbound-closed-conversation', () => {
    it(
      'given conversa com status=closed ' +
        'when appendMessage com direction=outbound ' +
        'then lança ConversationClosedError sem INSERT',
      async () => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([closedConversationRow]),
            }),
          }),
          insert: vi.fn(),
          update: vi.fn(),
        }

        await expect(
          appendMessage(tx as unknown as Parameters<typeof appendMessage>[0], {
            conversationId: CONVERSATION_ID,
            direction: 'outbound',
            body: 'Mensagem que não deve ser enviada',
            actorSystem: 'crm-agent',
          }),
        ).rejects.toThrow(ConversationClosedError)

        // Nenhum INSERT
        expect(tx.insert).not.toHaveBeenCalled()

        // Nenhum UPDATE
        expect(tx.update).not.toHaveBeenCalled()

        // Nenhum evento emitido
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso extra: conversa não encontrada → lança ConversationNotFoundError ─

  describe('append.conversation-not-found', () => {
    it(
      'given conversationId inexistente ' +
        'when appendMessage ' +
        'then lança ConversationNotFoundError sem INSERT',
      async () => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]), // conversa não encontrada
            }),
          }),
          insert: vi.fn(),
          update: vi.fn(),
        }

        await expect(
          appendMessage(tx as unknown as Parameters<typeof appendMessage>[0], {
            conversationId: '00000000-0000-0000-0000-000000000099',
            direction: 'inbound',
            body: 'Mensagem órfã',
            actorSystem: ACTOR_SYSTEM,
          }),
        ).rejects.toThrow(ConversationNotFoundError)

        expect(tx.insert).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso extra: inbound em conversa closed → permitido (reabertura) ───────

  describe('append.inbound-in-closed-conversation', () => {
    it(
      'given conversa closed e mensagem inbound ' +
        'when appendMessage ' +
        'then mensagem é inserida normalmente (inbound não verifica status closed)',
      async () => {
        // Nota: inbound em conversa closed é permitido no appendMessage —
        // a reabertura do status é responsabilidade de openOrReopenConversation.
        // O appendMessage apenas bloqueia outbound em closed.
        const tx = buildTxOpenConversation()

        // Alterar para retornar conversa closed mas aceitar o insert
        tx.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([closedConversationRow]),
          }),
        })

        const result = await appendMessage(
          tx as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'inbound',
            body: 'Mensagem reabrindo',
            actorSystem: ACTOR_SYSTEM,
          },
        )

        // Mensagem inserida com sucesso
        expect(result.id).toBe(MESSAGE_ID)
        expect(tx.insert).toHaveBeenCalledTimes(1)

        // TE-MESSAGE-INBOUND emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'message_inbound' }),
          tx,
        )
      },
    )
  })

  // ── Caso extra: mensagem outbound sem externalMessageId → INSERT direto ───

  describe('append.outbound-without-external-id', () => {
    it(
      'given conversa open e outbound sem externalMessageId ' +
        'when appendMessage ' +
        'then INSERT direto e emite message_outbound',
      async () => {
        const outboundMessage = {
          ...messageRow,
          direction: 'outbound',
          externalMessageId: null,
          actorUserId: '00000000-0000-0000-0000-000000000099',
          actorSystem: null,
        }

        const tx = buildTxOpenConversation(outboundMessage)

        const result = await appendMessage(
          tx as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'outbound',
            body: 'Resposta do atendente',
            actorUserId: '00000000-0000-0000-0000-000000000099',
          },
        )

        expect(result.direction).toBe('outbound')
        expect(tx.insert).toHaveBeenCalledTimes(1)

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'message_outbound',
            source: 'MOD-INBOX',
          }),
          tx,
        )
      },
    )
  })
})

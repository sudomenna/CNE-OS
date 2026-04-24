/**
 * T-3-18 — Testes unitários de idempotência de webhooks (3 canais)
 *
 * BR-INTEGRATION-IDEMPOTENCY:
 *   - uq_message_external (UNIQUE em message.external_message_id)
 *   - appendMessage captura conflito e retorna existente (sem novo INSERT nem TE)
 *   - Mappers são funções puras e determinísticas: mesma entrada → mesmo externalMessageId
 *
 * Estratégia: mesmo padrão de mock de tx de append-message.test.ts.
 * Zero I/O de rede ou BD (testes unit puros).
 *
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 * docs/20-domain/05-conversation-inbox.md §2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mapWhatsAppInbound } from '@/lib/integrations/whatsapp/map'
import { mapInstagramInbound } from '@/lib/integrations/instagram/map'
import { mapInboundEmail } from '@/lib/integrations/email/map'
import sampleText from '@/lib/integrations/whatsapp/fixtures/sample-text.json'
import sampleDm from '@/lib/integrations/instagram/fixtures/sample-dm.json'
import sampleEmail from '@/lib/integrations/email/fixtures/sample-email.json'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
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
  status: 'open' as const,
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

// ---------------------------------------------------------------------------
// Helpers de mock de tx
// ---------------------------------------------------------------------------

function buildTxWithConversation() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([openConversationRow]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([messageRow]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  }
}

/**
 * Cria um mock de tx que simula uma violação de unique constraint no INSERT
 * e retorna a mensagem existente no segundo SELECT.
 */
function buildTxWithUniqueViolation() {
  const uniqueViolationError = new Error(
    'duplicate key value violates unique constraint "uq_message_external"',
  )

  let selectCallCount = 0

  const tx = {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(
            selectCallCount === 1
              ? [openConversationRow] // primeira chamada: carregar conversa
              : [messageRow],         // segunda chamada: mensagem existente
          ),
        }),
      }
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(uniqueViolationError),
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

describe('BR-INTEGRATION-IDEMPOTENCY', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── appendMessage ─────────────────────────────────────────────────────────

  describe('appendMessage', () => {
    it(
      'given same externalMessageId delivered twice, ' +
        'when second call, ' +
        'then returns existing message without new insert',
      async () => {
        const tx = buildTxWithUniqueViolation()

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

        // Retorna mensagem existente com o mesmo ID e externalMessageId
        expect(result.id).toBe(MESSAGE_ID)
        expect(result.externalMessageId).toBe(EXTERNAL_MSG_ID)

        // INSERT tentado exatamente 1x (a violação de unique foi o trigger)
        expect(tx.insert).toHaveBeenCalledTimes(1)

        // UPDATE NÃO executado — idempotência: sem atualizar last_message_at
        expect(tx.update).not.toHaveBeenCalled()

        // Nenhum evento de timeline emitido — sem efeito colateral duplicado
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )

    it(
      'given same externalMessageId delivered 3 times, ' +
        'then still returns same message',
      async () => {
        // Primeira entrega: inserção normal
        const txFirst = buildTxWithConversation()
        const first = await appendMessage(
          txFirst as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'inbound',
            body: 'Mensagem original',
            externalMessageId: EXTERNAL_MSG_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )
        expect(first.id).toBe(MESSAGE_ID)
        expect(txFirst.insert).toHaveBeenCalledTimes(1)

        // Segunda entrega: conflito de unique → retorna existente
        vi.clearAllMocks()
        const txSecond = buildTxWithUniqueViolation()
        const second = await appendMessage(
          txSecond as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'inbound',
            body: 'Mensagem duplicada 2',
            externalMessageId: EXTERNAL_MSG_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )
        expect(second.id).toBe(MESSAGE_ID)
        expect(second.externalMessageId).toBe(EXTERNAL_MSG_ID)
        expect(txSecond.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()

        // Terceira entrega: mesmo comportamento
        vi.clearAllMocks()
        const txThird = buildTxWithUniqueViolation()
        const third = await appendMessage(
          txThird as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'inbound',
            body: 'Mensagem duplicada 3',
            externalMessageId: EXTERNAL_MSG_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )
        expect(third.id).toBe(MESSAGE_ID)
        expect(third.externalMessageId).toBe(EXTERNAL_MSG_ID)
        expect(txThird.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )

    it(
      'given different externalMessageId on same conversation, ' +
        'then creates new message',
      async () => {
        const DIFFERENT_EXTERNAL_ID = 'wamid.differentMessageABC'
        const differentMessageRow = {
          ...messageRow,
          id: '00000000-0000-0000-0000-000000000021',
          externalMessageId: DIFFERENT_EXTERNAL_ID,
          body: 'Mensagem diferente',
        }

        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([openConversationRow]),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([differentMessageRow]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }

        const result = await appendMessage(
          tx as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'inbound',
            body: 'Mensagem diferente',
            externalMessageId: DIFFERENT_EXTERNAL_ID,
            actorSystem: ACTOR_SYSTEM,
          },
        )

        // Nova mensagem criada com ID diferente
        expect(result.id).toBe('00000000-0000-0000-0000-000000000021')
        expect(result.externalMessageId).toBe(DIFFERENT_EXTERNAL_ID)

        // INSERT executado normalmente
        expect(tx.insert).toHaveBeenCalledTimes(1)

        // UPDATE de last_message_at executado
        expect(tx.update).toHaveBeenCalledTimes(1)

        // TE-MESSAGE-INBOUND emitido para a nova mensagem
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'message_inbound',
            source: 'MOD-INBOX',
          }),
          tx,
        )
      },
    )

    it(
      'given null externalMessageId, ' +
        'then always inserts (no idempotency guard)',
      async () => {
        const nullIdMessageRow = { ...messageRow, externalMessageId: null }

        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([openConversationRow]),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([nullIdMessageRow]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }

        // Primeira chamada sem externalMessageId
        const first = await appendMessage(
          tx as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'inbound',
            body: 'Mensagem sem external id',
            actorSystem: ACTOR_SYSTEM,
            // externalMessageId ausente — sem guarda de idempotência
          },
        )
        expect(first.externalMessageId).toBeNull()
        expect(tx.insert).toHaveBeenCalledTimes(1)
        expect(tx.update).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)

        // Segunda chamada idêntica: INSERT executado novamente (sem guarda)
        vi.clearAllMocks()
        const tx2 = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([openConversationRow]),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([nullIdMessageRow]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }

        const second = await appendMessage(
          tx2 as unknown as Parameters<typeof appendMessage>[0],
          {
            conversationId: CONVERSATION_ID,
            direction: 'inbound',
            body: 'Mensagem sem external id',
            actorSystem: ACTOR_SYSTEM,
          },
        )
        // Também insere normalmente — sem guarda de idempotência para null
        expect(second.externalMessageId).toBeNull()
        expect(tx2.insert).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
      },
    )
  })

  // ── mapWhatsAppInbound — estabilidade do externalMessageId ────────────────

  describe('mapWhatsAppInbound', () => {
    it(
      'given same WhatsApp payload delivered twice, ' +
        'when second call, ' +
        'then externalMessageId is stable (same value)',
      () => {
        const first = mapWhatsAppInbound(sampleText)
        const second = mapWhatsAppInbound(sampleText)

        expect(first).not.toBeNull()
        expect(second).not.toBeNull()

        // O externalMessageId deve ser idêntico nas duas chamadas — garantia de
        // idempotência no nível do mapper (BR-INTEGRATION-IDEMPOTENCY)
        expect(first!.externalMessageId).toBe(second!.externalMessageId)

        // O valor é derivado do campo `messages[0].id` do payload (wamid.*)
        expect(first!.externalMessageId).toBe(
          'wamid.HBgLNTUxMTkwMDAwMDAxFQIAERgSQUMyRTQ2MkI4QzQwMDAwMDAwAA==',
        )
      },
    )
  })

  // ── mapInstagramInbound — estabilidade do externalMessageId ───────────────

  describe('mapInstagramInbound', () => {
    it(
      'given same Instagram DM payload delivered twice, ' +
        'when second call, ' +
        'then externalMessageId is stable',
      () => {
        const first = mapInstagramInbound(sampleDm)
        const second = mapInstagramInbound(sampleDm)

        expect(first).not.toBeNull()
        expect(second).not.toBeNull()

        // Estabilidade: mesma entrada → mesmo externalMessageId
        expect(first!.externalMessageId).toBe(second!.externalMessageId)

        // ADR-16: formato canônico 'instagram:{mid}'
        expect(first!.externalMessageId).toBe(
          'instagram:aGlzdGFncmFtX21zZ19pZF9maXh0dXJl',
        )
      },
    )
  })

  // ── mapInboundEmail — estabilidade do messageId ────────────────────────────

  describe('mapInboundEmail', () => {
    it(
      'given same email delivered twice, ' +
        'when second call, ' +
        'then messageId is stable (same value)',
      () => {
        const first = mapInboundEmail(sampleEmail)
        const second = mapInboundEmail(sampleEmail)

        expect(first).not.toBeNull()
        expect(second).not.toBeNull()

        // Estabilidade: mesma entrada → mesmo messageId
        expect(first!.messageId).toBe(second!.messageId)

        // ADR-16: messageId sem < > é o external_message_id canônico
        expect(first!.messageId).toBe(
          'CABcDeFgHiJkLmNoPqRsTuVwXyZ1234567890@mail.gmail.com',
        )

        // Resultado completo é determinístico
        expect(first).toEqual(second)
      },
    )
  })
})

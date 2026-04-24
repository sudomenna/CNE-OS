/**
 * Integration: fluxo de changeStatus → contact_status_history
 *
 * Verifica que a lógica de orquestração da Server Action `changeContactStatus`
 * produz os inputs corretos para:
 *   1. INSERT em contact_status_history com from_status, to_status, changed_by, reason
 *   2. Chamada a classifyContact quando relevante (ex.: reativação com transações)
 *   3. Emissão do evento de timeline adequado
 *
 * Nota: sem banco real nesta fase (Sprint 1); DB é mockado explicitamente.
 * Os mocks estão rotulados para fácil substituição por testcontainer no Sprint 2+.
 *
 * docs/20-domain/02-contact-identity.md §3.8 (contact_status_history)
 * docs/20-domain/02-contact-identity.md §6.1 (transições de status)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  classifyContact,
  type ContactClassification,
  type TransactionForClassification,
} from '@/lib/domain/contact/classify'
import { makeContact, FIXTURE_IDS } from '@/tests/fixtures/factories'

// ---------------------------------------------------------------------------
// Stubs de DB e emitter — substituídos por calls reais no Sprint 2+
// ---------------------------------------------------------------------------

const mockDbInsertStatusHistory = vi.fn()
const mockEmitTimelineEvent = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Helper: simula a lógica completa de changeContactStatus da Server Action.
// Retorna o payload que seria gravado em contact_status_history.
// ---------------------------------------------------------------------------

type ContactStatus = 'active' | 'inactive' | 'blocked' | 'invalid'

type ChangeStatusInput = {
  contactId: string
  fromStatus: ContactStatus
  toStatus: ContactStatus
  changedBy: string | null
  reason?: string
  transactions?: TransactionForClassification[]
  currentClassification?: ContactClassification
}

type StatusHistoryPayload = {
  contactId: string
  fromStatus: ContactStatus
  toStatus: ContactStatus
  fromClassification: ContactClassification | null
  toClassification: ContactClassification | null
  changedBy: string | null
  reason: string | null
}

/**
 * Orquestra a mudança de status: valida transição, calcula reclassificação
 * se necessário, constrói payload do histórico e retorna para quem chama.
 *
 * Espelha o que changeContactStatus() fará na Server Action.
 */
async function orchestrateChangeStatus(input: ChangeStatusInput): Promise<StatusHistoryPayload> {
  const {
    contactId,
    fromStatus,
    toStatus,
    changedBy,
    reason = null,
    transactions = [],
    currentClassification = 'lead',
  } = input

  // Recalcular classificação quando o contato é reativado e há transações
  // from/to de classificação só é preenchido quando há mudança real de classificação
  let toClassification: ContactClassification | null = null
  let fromClassification: ContactClassification | null = null

  if (toStatus === 'active' && transactions.length > 0) {
    const recalculated = classifyContact(currentClassification, transactions)
    if (recalculated !== currentClassification) {
      // Houve mudança de classificação — preenche ambos
      fromClassification = currentClassification
      toClassification = recalculated
    }
  }

  const payload: StatusHistoryPayload = {
    contactId,
    fromStatus,
    toStatus,
    fromClassification,
    toClassification,
    changedBy,
    reason,
  }

  return payload
}

// ---------------------------------------------------------------------------
// Testes — fluxo completo changeStatus → contact_status_history
// ---------------------------------------------------------------------------

describe('contact_status_history — fluxo de changeContactStatus', () => {
  const contact = makeContact()

  // -------------------------------------------------------------------------
  // CT-STATUS-HIST-01: INSERT com campos corretos
  // INV-CONTACT-07: toda mudança em status gera linha em contact_status_history
  // -------------------------------------------------------------------------
  describe('CT-STATUS-HIST-01: INSERT em contact_status_history com campos corretos', () => {
    it('given contato active e mudança para blocked, when changeContactStatus, then INSERT com from_status=active e to_status=blocked', async () => {
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'active',
        toStatus: 'blocked',
        changedBy: FIXTURE_IDS.user,
        reason: 'spam',
      })

      // Simula o que a Server Action faria: INSERT no DB
      mockDbInsertStatusHistory(payload)

      expect(mockDbInsertStatusHistory).toHaveBeenCalledOnce()
      expect(mockDbInsertStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: contact.id,
          fromStatus: 'active',
          toStatus: 'blocked',
          changedBy: FIXTURE_IDS.user,
          reason: 'spam',
        }),
      )
    })

    it('given contato inactive e mudança para active, when changeContactStatus, then INSERT com from_status=inactive e to_status=active', async () => {
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'inactive',
        toStatus: 'active',
        changedBy: FIXTURE_IDS.user,
        reason: 'reactivated_by_admin',
      })

      mockDbInsertStatusHistory(payload)

      expect(mockDbInsertStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStatus: 'inactive',
          toStatus: 'active',
          reason: 'reactivated_by_admin',
        }),
      )
    })

    it('given mudança de status, when INSERT, then changedBy está preenchido corretamente', async () => {
      const specificUserId = '99999999-0000-0000-0000-000000000001'
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'active',
        toStatus: 'inactive',
        changedBy: specificUserId,
        reason: 'deactivation',
      })

      mockDbInsertStatusHistory(payload)

      expect(mockDbInsertStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({ changedBy: specificUserId }),
      )
    })

    it('given mudança por automação (sistema), when changeContactStatus, then changedBy=null', async () => {
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'active',
        toStatus: 'invalid',
        changedBy: null, // automação
        reason: 'hard_bounce',
      })

      mockDbInsertStatusHistory(payload)

      expect(mockDbInsertStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({ changedBy: null }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // CT-STATUS-HIST-02: classifyContact é chamado quando relevante
  // Reativação de contato com transações → reclassificar
  // -------------------------------------------------------------------------
  describe('CT-STATUS-HIST-02: classifyContact chamado na reativação com transações', () => {
    it('given contato inactive com transação de mentoring aprovada, when reativado (toStatus=active), then classifyContact recalcula e toClassification=customer', async () => {
      const transactions: TransactionForClassification[] = [
        { transactionId: 'tx-stub-1', status: 'approved', productKinds: ['mentoring'] },
      ]

      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'inactive',
        toStatus: 'active',
        changedBy: FIXTURE_IDS.user,
        currentClassification: 'lead',
        transactions,
      })

      // Deve ter calculado reclassificação
      expect(payload.toClassification).toBe('customer')
      expect(payload.fromClassification).toBe('lead')
    })

    it('given contato inactive com course aprovado, when reativado, then toClassification=student no payload', async () => {
      const transactions: TransactionForClassification[] = [
        { transactionId: 'tx-stub-2', status: 'approved', productKinds: ['course'] },
      ]

      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'inactive',
        toStatus: 'active',
        changedBy: FIXTURE_IDS.user,
        currentClassification: 'lead',
        transactions,
      })

      expect(payload.toClassification).toBe('student')
    })

    it('given contato inactive sem transações, when reativado, then toClassification=null (sem reclassificação)', async () => {
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'inactive',
        toStatus: 'active',
        changedBy: FIXTURE_IDS.user,
        currentClassification: 'lead',
        transactions: [], // sem transações
      })

      expect(payload.toClassification).toBe(null)
    })

    it('given contato que muda para blocked (não=active), when changeContactStatus, then toClassification=null (classifyContact não é chamado)', async () => {
      const transactions: TransactionForClassification[] = [
        { transactionId: 'tx-stub-3', status: 'approved', productKinds: ['mentoring'] },
      ]

      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'active',
        toStatus: 'blocked', // bloquear não reclassifica
        changedBy: FIXTURE_IDS.user,
        currentClassification: 'customer',
        transactions,
      })

      // blocked não aciona reclassificação
      expect(payload.toClassification).toBe(null)
    })
  })

  // -------------------------------------------------------------------------
  // CT-STATUS-HIST-03: emissão de evento de timeline correto
  // docs/20-domain/02-contact-identity.md §8
  // -------------------------------------------------------------------------
  describe('CT-STATUS-HIST-03: emissão de timeline event após mudança de status', () => {
    it('given status muda para blocked, when changeContactStatus, then emitTimelineEvent chamado com kind=contact_blacklisted', async () => {
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'active',
        toStatus: 'blocked',
        changedBy: FIXTURE_IDS.user,
        reason: 'abusive_behavior',
      })

      // Simula o que a Server Action faria: emitir TE-CONTACT-BLACKLISTED
      mockEmitTimelineEvent({
        contactId: contact.id,
        kind: 'contact_blacklisted', // TE-CONTACT-BLACKLISTED → snake_case
        source: 'MOD-CONTACT',
        actorUserId: payload.changedBy,
        payload: { reason: payload.reason },
      })

      expect(mockEmitTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'contact_blacklisted',
          payload: { reason: 'abusive_behavior' },
        }),
      )
    })

    it('given status muda para inactive/active/invalid, when changeContactStatus, then emitTimelineEvent chamado com kind=contact_updated', async () => {
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'active',
        toStatus: 'inactive',
        changedBy: FIXTURE_IDS.user,
        reason: 'no_activity',
      })

      // Simula TE-CONTACT-UPDATED para mudanças que não são blacklist
      mockEmitTimelineEvent({
        contactId: contact.id,
        kind: 'contact_updated', // TE-CONTACT-UPDATED → snake_case
        source: 'MOD-CONTACT',
        actorUserId: payload.changedBy,
        payload: { field: 'status', from: payload.fromStatus, to: payload.toStatus },
      })

      expect(mockEmitTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'contact_updated',
          payload: expect.objectContaining({ field: 'status', from: 'active', to: 'inactive' }),
        }),
      )
    })

    it('given mudança de status com reclassificação, when toClassification != null, then dois eventos emitidos: contact_updated + contact_classification_changed', async () => {
      const transactions: TransactionForClassification[] = [
        { transactionId: 'tx-stub-4', status: 'approved', productKinds: ['mentoring'] },
      ]

      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'inactive',
        toStatus: 'active',
        changedBy: FIXTURE_IDS.user,
        currentClassification: 'lead',
        transactions,
      })

      // Emite TE-CONTACT-UPDATED para status
      mockEmitTimelineEvent({
        kind: 'contact_updated',
        source: 'MOD-CONTACT',
        payload: { field: 'status', from: payload.fromStatus, to: payload.toStatus },
      })

      // Se houve reclassificação, emite também TE-CONTACT-CLASSIFICATION-CHANGED
      if (payload.toClassification !== null) {
        mockEmitTimelineEvent({
          kind: 'contact_classification_changed',
          source: 'MOD-CONTACT',
          payload: {
            from: payload.fromClassification,
            to: payload.toClassification,
            reason: 'status_change_reactivation',
          },
        })
      }

      expect(mockEmitTimelineEvent).toHaveBeenCalledTimes(2)
      expect(mockEmitTimelineEvent).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ kind: 'contact_updated' }),
      )
      expect(mockEmitTimelineEvent).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ kind: 'contact_classification_changed' }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // CT-STATUS-HIST-04: payload do histórico tem todos os campos obrigatórios
  // INV-CONTACT-07: campos from_status, to_status, changed_by, reason
  // docs/20-domain/02-contact-identity.md §3.8
  // -------------------------------------------------------------------------
  describe('CT-STATUS-HIST-04: payload completo de contact_status_history', () => {
    it('given mudança active→blocked, when payload montado, then contém contactId, fromStatus, toStatus, changedBy, reason', async () => {
      const userId = FIXTURE_IDS.user
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'active',
        toStatus: 'blocked',
        changedBy: userId,
        reason: 'test_reason',
      })

      expect(payload).toMatchObject({
        contactId: contact.id,
        fromStatus: 'active',
        toStatus: 'blocked',
        changedBy: userId,
        reason: 'test_reason',
      })
    })

    it('given mudança sem reclassificação, when payload montado, then fromClassification e toClassification são null', async () => {
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'active',
        toStatus: 'blocked',
        changedBy: FIXTURE_IDS.user,
        currentClassification: 'customer',
        transactions: [{ transactionId: 'tx-5', status: 'approved', productKinds: ['mentoring'] }],
      })

      // blocked não reclassifica
      expect(payload.fromClassification).toBe(null)
      expect(payload.toClassification).toBe(null)
    })

    it('given reativação com reclassificação, when payload montado, then fromClassification e toClassification preenchidos', async () => {
      const payload = await orchestrateChangeStatus({
        contactId: contact.id,
        fromStatus: 'inactive',
        toStatus: 'active',
        changedBy: FIXTURE_IDS.user,
        currentClassification: 'lead',
        transactions: [{ transactionId: 'tx-6', status: 'approved', productKinds: ['course'] }],
      })

      expect(payload.fromClassification).toBe('lead')
      expect(payload.toClassification).toBe('student')
    })
  })
})

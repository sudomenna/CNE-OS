/**
 * Integration: reclassificação de contato + histórico de status
 *
 * Testa a integração entre a função de domínio pura `classifyContact` e a
 * lógica de orquestração que seria executada pela Server Action:
 *   1. Calcular nova classificação
 *   2. Comparar com a atual
 *   3. Se diferente → INSERT em contact_status_history + emitir TE
 *
 * Nota: sem banco real nesta fase (Sprint 1); DB é mockado onde necessário.
 * Mocks de DB estão explicitamente rotulados para facilitar substituição por
 * testcontainer no Sprint 2+.
 *
 * BR-CONTACT-CLASSIFICATION
 * docs/50-business-rules/BR-CONTACT-CLASSIFICATION.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  classifyContact,
  type ContactClassification,
  type TransactionForClassification,
} from '@/lib/domain/contact/classify'

// ---------------------------------------------------------------------------
// Helper: simula a lógica de orquestração da Server Action
// (recalcular → comparar → decidir se houve mudança e qual payload emitir)
// ---------------------------------------------------------------------------

type ReclassificationInput = {
  current: ContactClassification
  transactions: { status: string; productKinds: string[] }[]
}

type ReclassificationResult = {
  changed: boolean
  from: ContactClassification
  to: ContactClassification
}

/**
 * Orquestra classifyContact e retorna { changed, from, to }.
 * Espelha o que a Server Action fará antes de gravar no DB.
 */
function applyReclassification(input: ReclassificationInput): ReclassificationResult {
  const { current, transactions } = input
  const newClassification = classifyContact(
    current,
    transactions.map((t) => ({
      transactionId: 'stub-tx',
      status: t.status as TransactionForClassification['status'],
      productKinds: t.productKinds as TransactionForClassification['productKinds'],
    })),
  )
  return {
    changed: newClassification !== current,
    from: current,
    to: newClassification,
  }
}

/**
 * Monta o payload canônico de TE-CONTACT-CLASSIFICATION-CHANGED.
 * A Server Action usará este payload ao chamar emitTimelineEvent.
 * docs/30-contracts/03-timeline-event-catalog.md
 */
function buildClassificationChangedPayload(
  from: ContactClassification,
  to: ContactClassification,
  reason: string,
) {
  return { from, to, reason }
}

// ---------------------------------------------------------------------------
// Stubs de INSERT em contact_status_history e de emitTimelineEvent.
// Em Sprint 2+ serão substituídos por chamadas reais ao testcontainer.
// ---------------------------------------------------------------------------

const mockInsertStatusHistory = vi.fn()
const mockEmitTimelineEvent = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Testes BR-CONTACT-CLASSIFICATION — integração reclassificação + histórico
// ---------------------------------------------------------------------------

describe('BR-CONTACT-CLASSIFICATION — integração reclassificação + histórico', () => {
  // -------------------------------------------------------------------------
  // Test 1 — compra aprovada muda lead para customer
  // BR-CONTACT-CLASSIFICATION §3: mentoring não é course → customer
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-01: lead com compra de mentoring aprovada', () => {
    it('given lead e transação de mentoring aprovada, when classifyContact, then resultado é customer', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['mentoring'] }],
      })

      expect(result.to).toBe('customer')
    })

    it('given lead e transação de mentoring aprovada, when applyReclassification, then changed=true', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['mentoring'] }],
      })

      expect(result.changed).toBe(true)
    })

    it('given lead e transação de mentoring aprovada, when changed=true, then INSERT em contact_status_history com from=lead e to=customer', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['mentoring'] }],
      })

      // Simula o que a Server Action faria ao detectar mudança
      if (result.changed) {
        mockInsertStatusHistory({
          fromClassification: result.from,
          toClassification: result.to,
          reason: 'first_approved_sale',
        })
      }

      expect(mockInsertStatusHistory).toHaveBeenCalledOnce()
      expect(mockInsertStatusHistory).toHaveBeenCalledWith({
        fromClassification: 'lead',
        toClassification: 'customer',
        reason: 'first_approved_sale',
      })
    })
  })

  // -------------------------------------------------------------------------
  // Test 2 — reclassificação grava entrada em contact_status_history
  // Verifica que o payload de INSERT contém os campos corretos
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-02: reclassificação grava contact_status_history', () => {
    it('given paid_lead com ebook e nova compra de course aprovada, when changed=true, then INSERT com from e to corretos', () => {
      const result = applyReclassification({
        current: 'paid_lead',
        transactions: [
          { status: 'approved', productKinds: ['ebook'] },
          { status: 'approved', productKinds: ['course'] },
        ],
      })

      expect(result.changed).toBe(true)
      expect(result.from).toBe('paid_lead')
      expect(result.to).toBe('student')

      // Simula INSERT no DB (stub)
      if (result.changed) {
        mockInsertStatusHistory({
          fromClassification: result.from,
          toClassification: result.to,
          reason: 'course_purchase',
          changedBy: null, // automação, não usuário
        })
      }

      expect(mockInsertStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          fromClassification: 'paid_lead',
          toClassification: 'student',
          changedBy: null,
        }),
      )
    })

    it('given classificação inalterada (student já com course), when applyReclassification, then changed=false e INSERT NÃO é chamado', () => {
      const result = applyReclassification({
        current: 'student',
        transactions: [{ status: 'approved', productKinds: ['course'] }],
      })

      expect(result.changed).toBe(false)
      expect(result.from).toBe('student')
      expect(result.to).toBe('student')

      // Server Action só insere se changed=true
      if (result.changed) {
        mockInsertStatusHistory({ fromClassification: result.from, toClassification: result.to })
      }

      expect(mockInsertStatusHistory).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Test 3 — reembolso reverte classificação
  // BR-CONTACT-CLASSIFICATION: course refunded → não conta → customer
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-03: reembolso reverte classificação', () => {
    it('given student com course refunded e mentoring aprovado, when classifyContact, then resultado é customer', () => {
      // student com 1 course (refunded) e 1 mentoring (approved)
      const result = applyReclassification({
        current: 'student',
        transactions: [
          { status: 'refunded', productKinds: ['course'] },
          { status: 'approved', productKinds: ['mentoring'] },
        ],
      })

      expect(result.to).toBe('customer')
    })

    it('given student com course refunded e mentoring aprovado, when applyReclassification, then changed=true (student→customer)', () => {
      const result = applyReclassification({
        current: 'student',
        transactions: [
          { status: 'refunded', productKinds: ['course'] },
          { status: 'approved', productKinds: ['mentoring'] },
        ],
      })

      expect(result.changed).toBe(true)
      expect(result.from).toBe('student')
      expect(result.to).toBe('customer')
    })

    it('given customer com única mentoring refunded, when applyReclassification, then resultado é lead', () => {
      const result = applyReclassification({
        current: 'customer',
        transactions: [{ status: 'refunded', productKinds: ['mentoring'] }],
      })

      expect(result.to).toBe('lead')
      expect(result.changed).toBe(true)
    })

    it('given paid_lead com único ebook refunded, when applyReclassification, then resultado é lead', () => {
      const result = applyReclassification({
        current: 'paid_lead',
        transactions: [{ status: 'refunded', productKinds: ['ebook'] }],
      })

      expect(result.to).toBe('lead')
      expect(result.changed).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Test 4 — reclassificação emite TE-CONTACT-CLASSIFICATION-CHANGED
  // docs/30-contracts/03-timeline-event-catalog.md
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-04: emissão de TE-CONTACT-CLASSIFICATION-CHANGED', () => {
    it('given lead e mentoring aprovado, when changed=true, then emitTimelineEvent chamado com kind=contact_classification_changed e payload { from, to, reason }', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['mentoring'] }],
      })

      // Simula o que a Server Action faria: emitir o TE com payload canônico
      if (result.changed) {
        const payload = buildClassificationChangedPayload(result.from, result.to, 'first_approved_sale')
        mockEmitTimelineEvent({
          kind: 'contact_classification_changed', // TE-CONTACT-CLASSIFICATION-CHANGED → snake_case
          source: 'MOD-CONTACT',
          payload,
        })
      }

      expect(mockEmitTimelineEvent).toHaveBeenCalledOnce()
      expect(mockEmitTimelineEvent).toHaveBeenCalledWith({
        kind: 'contact_classification_changed',
        source: 'MOD-CONTACT',
        payload: {
          from: 'lead',
          to: 'customer',
          reason: 'first_approved_sale',
        },
      })
    })

    it('given student já com course (sem mudança), when changed=false, then emitTimelineEvent NÃO é chamado', () => {
      const result = applyReclassification({
        current: 'student',
        transactions: [{ status: 'approved', productKinds: ['course'] }],
      })

      // Server Action só emite se changed=true
      if (result.changed) {
        mockEmitTimelineEvent({ kind: 'contact_classification_changed', source: 'MOD-CONTACT' })
      }

      expect(mockEmitTimelineEvent).not.toHaveBeenCalled()
    })

    it('given student com course refunded, when changed=true, then payload tem from=student e to=customer', () => {
      const result = applyReclassification({
        current: 'student',
        transactions: [
          { status: 'refunded', productKinds: ['course'] },
          { status: 'approved', productKinds: ['mentoring'] },
        ],
      })

      if (result.changed) {
        const payload = buildClassificationChangedPayload(result.from, result.to, 'course_refund')
        mockEmitTimelineEvent({
          kind: 'contact_classification_changed',
          source: 'MOD-CONTACT',
          payload,
        })
      }

      expect(mockEmitTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ from: 'student', to: 'customer', reason: 'course_refund' }),
        }),
      )
    })

    it('given paid_lead com ebook e compra de course aprovada, when changed=true, then payload tem from=paid_lead e to=student', () => {
      const result = applyReclassification({
        current: 'paid_lead',
        transactions: [
          { status: 'approved', productKinds: ['ebook'] },
          { status: 'approved', productKinds: ['course'] },
        ],
      })

      if (result.changed) {
        const payload = buildClassificationChangedPayload(result.from, result.to, 'course_purchase')
        mockEmitTimelineEvent({
          kind: 'contact_classification_changed',
          source: 'MOD-CONTACT',
          payload,
        })
      }

      expect(mockEmitTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ from: 'paid_lead', to: 'student' }),
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // Casos de borda da hierarquia completa (cobertura de todos os ramos)
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-05: hierarquia completa lead → paid_lead → customer → student', () => {
    it('given lead quando ebook aprovado, when applyReclassification, then to=paid_lead e changed=true', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['ebook'] }],
      })

      expect(result.to).toBe('paid_lead')
      expect(result.changed).toBe(true)
    })

    it('given lead quando ebook e mentoring aprovados, when applyReclassification, then to=customer (não paid_lead)', () => {
      // BR-CONTACT-CLASSIFICATION: paid_lead apenas se EXCLUSIVAMENTE ebook/bonus/other
      const result = applyReclassification({
        current: 'lead',
        transactions: [
          { status: 'approved', productKinds: ['ebook'] },
          { status: 'approved', productKinds: ['mentoring'] },
        ],
      })

      expect(result.to).toBe('customer')
    })

    it('given lead quando training_in_person aprovado, when applyReclassification, then to=student', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['training_in_person'] }],
      })

      expect(result.to).toBe('student')
    })

    it('given lead quando somente transações recusadas, when applyReclassification, then to=lead e changed=false', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'refused', productKinds: ['course'] }],
      })

      expect(result.to).toBe('lead')
      expect(result.changed).toBe(false)
    })
  })
})

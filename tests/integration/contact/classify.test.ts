/**
 * Integration: reclassificação de contato + histórico de status
 *
 * Testa a integração entre a função de domínio pura `classifyContact` e a
 * lógica de orquestração que seria executada pela Server Action:
 *   1. Calcular nova classificação
 *   2. Comparar com a atual
 *   3. Se diferente → INSERT em contact_status_history + emitir TE
 *
 * Hierarquia BR-CONTACT-CLASSIFICATION: mentorado > student > customer > lead
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

function buildClassificationChangedPayload(
  from: ContactClassification,
  to: ContactClassification,
  reason: string,
) {
  return { from, to, reason }
}

const mockInsertStatusHistory = vi.fn()
const mockEmitTimelineEvent = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BR-CONTACT-CLASSIFICATION — integração reclassificação + histórico', () => {
  // -------------------------------------------------------------------------
  // CT-CLASSIFY-INT-01: lead com mentoring → mentorado
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-01: lead com compra de mentoring aprovada', () => {
    it('given lead e mentoring aprovado, when classifyContact, then resultado é mentorado', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['mentoring'] }],
      })
      expect(result.to).toBe('mentorado')
    })

    it('given lead e mentoring aprovado, when applyReclassification, then changed=true', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['mentoring'] }],
      })
      expect(result.changed).toBe(true)
    })

    it('given lead e mentoring aprovado, when changed=true, then INSERT em contact_status_history com from=lead e to=mentorado', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['mentoring'] }],
      })
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
        toClassification: 'mentorado',
        reason: 'first_approved_sale',
      })
    })
  })

  // -------------------------------------------------------------------------
  // CT-CLASSIFY-INT-02: customer com ebook + course → student
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-02: reclassificação grava contact_status_history', () => {
    it('given customer com ebook e nova compra de course, when changed=true, then INSERT com from=customer e to=student', () => {
      const result = applyReclassification({
        current: 'customer',
        transactions: [
          { status: 'approved', productKinds: ['ebook'] },
          { status: 'approved', productKinds: ['course'] },
        ],
      })

      expect(result.changed).toBe(true)
      expect(result.from).toBe('customer')
      expect(result.to).toBe('student')

      if (result.changed) {
        mockInsertStatusHistory({
          fromClassification: result.from,
          toClassification: result.to,
          reason: 'course_purchase',
          changedBy: null,
        })
      }

      expect(mockInsertStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          fromClassification: 'customer',
          toClassification: 'student',
          changedBy: null,
        }),
      )
    })

    it('given student já com course (sem mudança), when applyReclassification, then changed=false e INSERT NÃO é chamado', () => {
      const result = applyReclassification({
        current: 'student',
        transactions: [{ status: 'approved', productKinds: ['course'] }],
      })

      expect(result.changed).toBe(false)
      if (result.changed) {
        mockInsertStatusHistory({ fromClassification: result.from, toClassification: result.to })
      }
      expect(mockInsertStatusHistory).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // CT-CLASSIFY-INT-03: reembolso reverte
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-03: reembolso reverte classificação', () => {
    it('given mentorado com mentoring refunded e course aprovado, when applyReclassification, then to=student', () => {
      const result = applyReclassification({
        current: 'mentorado',
        transactions: [
          { status: 'refunded', productKinds: ['mentoring'] },
          { status: 'approved', productKinds: ['course'] },
        ],
      })
      expect(result.to).toBe('student')
      expect(result.changed).toBe(true)
    })

    it('given student com course refunded e ebook aprovado, when applyReclassification, then to=customer', () => {
      const result = applyReclassification({
        current: 'student',
        transactions: [
          { status: 'refunded', productKinds: ['course'] },
          { status: 'approved', productKinds: ['ebook'] },
        ],
      })
      expect(result.to).toBe('customer')
      expect(result.changed).toBe(true)
    })

    it('given customer com única ebook refunded, when applyReclassification, then to=lead', () => {
      const result = applyReclassification({
        current: 'customer',
        transactions: [{ status: 'refunded', productKinds: ['ebook'] }],
      })
      expect(result.to).toBe('lead')
      expect(result.changed).toBe(true)
    })

    it('given mentorado com única mentoring refunded, when applyReclassification, then to=lead', () => {
      const result = applyReclassification({
        current: 'mentorado',
        transactions: [{ status: 'refunded', productKinds: ['mentoring'] }],
      })
      expect(result.to).toBe('lead')
      expect(result.changed).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // CT-CLASSIFY-INT-04: emite TE-CONTACT-CLASSIFICATION-CHANGED
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-04: emissão de TE-CONTACT-CLASSIFICATION-CHANGED', () => {
    it('given lead e mentoring aprovado, when changed=true, then emit com payload {from:lead,to:mentorado}', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['mentoring'] }],
      })

      if (result.changed) {
        const payload = buildClassificationChangedPayload(result.from, result.to, 'first_approved_sale')
        mockEmitTimelineEvent({
          kind: 'contact_classification_changed',
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
          to: 'mentorado',
          reason: 'first_approved_sale',
        },
      })
    })

    it('given student já com course (sem mudança), when changed=false, then emit NÃO é chamado', () => {
      const result = applyReclassification({
        current: 'student',
        transactions: [{ status: 'approved', productKinds: ['course'] }],
      })

      if (result.changed) {
        mockEmitTimelineEvent({ kind: 'contact_classification_changed', source: 'MOD-CONTACT' })
      }
      expect(mockEmitTimelineEvent).not.toHaveBeenCalled()
    })

    it('given mentorado com course aprovado e mentoring refunded, when changed=true, then payload from=mentorado to=student', () => {
      const result = applyReclassification({
        current: 'mentorado',
        transactions: [
          { status: 'refunded', productKinds: ['mentoring'] },
          { status: 'approved', productKinds: ['course'] },
        ],
      })

      if (result.changed) {
        const payload = buildClassificationChangedPayload(result.from, result.to, 'mentoring_refund')
        mockEmitTimelineEvent({
          kind: 'contact_classification_changed',
          source: 'MOD-CONTACT',
          payload,
        })
      }

      expect(mockEmitTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ from: 'mentorado', to: 'student', reason: 'mentoring_refund' }),
        }),
      )
    })

    it('given customer com nova compra de course, when changed=true, then payload from=customer to=student', () => {
      const result = applyReclassification({
        current: 'customer',
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
          payload: expect.objectContaining({ from: 'customer', to: 'student' }),
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // CT-CLASSIFY-INT-05: hierarquia mentorado > student > customer > lead
  // -------------------------------------------------------------------------
  describe('CT-CLASSIFY-INT-05: hierarquia completa', () => {
    it('given lead com ebook aprovado, when applyReclassification, then to=customer', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['ebook'] }],
      })
      expect(result.to).toBe('customer')
      expect(result.changed).toBe(true)
    })

    it('given lead com course e mentoring aprovados, when applyReclassification, then to=mentorado (mentorado > student)', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [
          { status: 'approved', productKinds: ['course'] },
          { status: 'approved', productKinds: ['mentoring'] },
        ],
      })
      expect(result.to).toBe('mentorado')
    })

    it('given lead com training_in_person aprovado, when applyReclassification, then to=student', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'approved', productKinds: ['training_in_person'] }],
      })
      expect(result.to).toBe('student')
    })

    it('given lead com transações recusadas, when applyReclassification, then to=lead e changed=false', () => {
      const result = applyReclassification({
        current: 'lead',
        transactions: [{ status: 'refused', productKinds: ['course'] }],
      })
      expect(result.to).toBe('lead')
      expect(result.changed).toBe(false)
    })
  })
})

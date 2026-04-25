/**
 * Testes de integração — Digital Guru webhook: verificação de assinatura HMAC-SHA256
 *
 * Cobre:
 *   - verifyDigitalGuruSignature: assinatura válida, inválida, payload alterado
 *   - Casos edge: secret vazio, signature vazia, hex inválido, buffers com tamanhos diferentes
 *
 * Nota: função pura, zero I/O de rede ou BD.
 * HMAC calculado com o mesmo algoritmo da implementação — nunca mockado (CLAUDE.md §convenções).
 *
 * T-8-13 / docs/40-integrations/01-digital-guru.md
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyDigitalGuruSignature } from '@/lib/integrations/digital-guru/verify-signature'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-digital-guru-secret-for-vitest'

function computeSignature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

// ---------------------------------------------------------------------------
// verifyDigitalGuruSignature
// ---------------------------------------------------------------------------

describe('verifyDigitalGuruSignature', () => {
  // CT-DG-07 análogo: assinatura válida retorna true
  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ id: 'evt_abc123', event_type: 'purchase.approved' })
    const sig = computeSignature(body, TEST_SECRET)
    expect(verifyDigitalGuruSignature(body, sig, TEST_SECRET)).toBe(true)
  })

  // CT-DG-07: assinatura inválida retorna false
  it('returns false for a signature computed with wrong secret', () => {
    const body = JSON.stringify({ id: 'evt_abc123', event_type: 'purchase.approved' })
    const sig = computeSignature(body, TEST_SECRET)
    expect(verifyDigitalGuruSignature(body, sig, 'wrong-secret')).toBe(false)
  })

  // Payload alterado invalida assinatura
  it('returns false when payload is tampered after signature was computed', () => {
    const original = JSON.stringify({ id: 'evt_abc123', event_type: 'purchase.approved' })
    const sig = computeSignature(original, TEST_SECRET)
    const tampered = JSON.stringify({ id: 'evt_abc123', event_type: 'purchase.refunded' })
    expect(verifyDigitalGuruSignature(tampered, sig, TEST_SECRET)).toBe(false)
  })

  // Adicionar um campo ao payload invalida assinatura
  it('returns false when a field is added to the payload after signing', () => {
    const original = JSON.stringify({ id: 'evt_abc123' })
    const sig = computeSignature(original, TEST_SECRET)
    const extended = JSON.stringify({ id: 'evt_abc123', extra: 'injected' })
    expect(verifyDigitalGuruSignature(extended, sig, TEST_SECRET)).toBe(false)
  })

  // Assinatura vazia
  it('returns false for an empty signature', () => {
    const body = JSON.stringify({ id: 'evt_abc123' })
    expect(verifyDigitalGuruSignature(body, '', TEST_SECRET)).toBe(false)
  })

  // Secret vazio
  it('returns false when secret is empty', () => {
    const body = JSON.stringify({ id: 'evt_abc123' })
    const sig = computeSignature(body, TEST_SECRET)
    expect(verifyDigitalGuruSignature(body, sig, '')).toBe(false)
  })

  // Hex malformado (caracteres não-hex)
  it('returns false for a malformed hex signature (non-hex chars)', () => {
    const body = JSON.stringify({ id: 'evt_abc123' })
    expect(verifyDigitalGuruSignature(body, 'zzzzzz', TEST_SECRET)).toBe(false)
  })

  // Hex com comprimento diferente do esperado (buffers de tamanhos distintos)
  it('returns false when signature hex is too short (buffer length mismatch)', () => {
    const body = JSON.stringify({ id: 'evt_abc123' })
    // SHA256 produz 32 bytes = 64 chars hex; truncar para 32 chars
    const sig = computeSignature(body, TEST_SECRET)
    const truncated = sig.slice(0, 32)
    expect(verifyDigitalGuruSignature(body, truncated, TEST_SECRET)).toBe(false)
  })

  // Payload realista — purchase.approved completo
  it('returns true for a realistic purchase.approved payload', () => {
    const body = JSON.stringify({
      id: 'evt_purchase_approved_001',
      event_type: 'purchase.approved',
      data: {
        transaction: {
          id: 'txn_001',
          amount_cents: 29700,
          currency: 'BRL',
          payment_method: 'credit_card',
          installments: 3,
          approved_at: '2026-04-24T12:00:00Z',
        },
        customer: {
          name: 'João Silva',
          email: 'joao@example.com',
          document: '123.456.789-09',
          phone_country: '55',
          phone_area: '11',
          phone_number: '912345678',
        },
        product: { id: 'prod_ext_001' },
        checkout: { utm_source: 'google', utm_medium: 'cpc' },
      },
    })
    const sig = computeSignature(body, TEST_SECRET)
    expect(verifyDigitalGuruSignature(body, sig, TEST_SECRET)).toBe(true)
  })

  // Payload realista — subscription.renewed
  it('returns true for a realistic subscription.renewed payload', () => {
    const body = JSON.stringify({
      id: 'evt_sub_renewed_002',
      event_type: 'subscription.renewed',
      data: {
        subscription: {
          id: 'sub_ext_001',
          current_period_end: '2026-05-24T00:00:00Z',
        },
        installment: {
          id: 'inst_ext_007',
          due_at: '2026-04-24T00:00:00Z',
        },
      },
    })
    const sig = computeSignature(body, TEST_SECRET)
    expect(verifyDigitalGuruSignature(body, sig, TEST_SECRET)).toBe(true)
  })
})

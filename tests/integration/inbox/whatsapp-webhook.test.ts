/**
 * Testes de integração — WhatsApp Business Official webhook adapter
 *
 * Cobre:
 *   - verifyWhatsAppSignature: assinatura válida, inválida, formato incorreto
 *   - mapWhatsAppInbound: mensagem de texto, imagem, status update (→ null)
 *   - Idempotência lógica: mesmo externalMessageId já coberto por append-message (INV-INBOX-02)
 *
 * Nota: estes testes são unitários puros (zero I/O de rede ou BD).
 * Os testes de integração com BD real ficam em T-3-18 (webhook-idempotency.test.ts).
 *
 * T-3-07 / docs/30-contracts/04-webhook-contracts.md §5.3
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyWhatsAppSignature } from '@/lib/integrations/whatsapp/webhook'
import { mapWhatsAppInbound } from '@/lib/integrations/whatsapp/map'
import sampleText from '@/lib/integrations/whatsapp/fixtures/sample-text.json'
import sampleImage from '@/lib/integrations/whatsapp/fixtures/sample-image.json'
import sampleStatus from '@/lib/integrations/whatsapp/fixtures/sample-status.json'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-app-secret-for-vitest'

function computeSignature(body: string, secret: string): string {
  const hmac = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  return `sha256=${hmac}`
}

// ---------------------------------------------------------------------------
// verifyWhatsAppSignature
// ---------------------------------------------------------------------------

describe('verifyWhatsAppSignature', () => {
  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ test: 'payload' })
    const sig = computeSignature(body, TEST_SECRET)
    expect(verifyWhatsAppSignature(body, sig, TEST_SECRET)).toBe(true)
  })

  it('returns false for a tampered body', () => {
    const body = JSON.stringify({ test: 'payload' })
    const sig = computeSignature(body, TEST_SECRET)
    const tamperedBody = JSON.stringify({ test: 'tampered' })
    expect(verifyWhatsAppSignature(tamperedBody, sig, TEST_SECRET)).toBe(false)
  })

  it('returns false for wrong secret', () => {
    const body = JSON.stringify({ test: 'payload' })
    const sig = computeSignature(body, TEST_SECRET)
    expect(verifyWhatsAppSignature(body, sig, 'wrong-secret')).toBe(false)
  })

  it('returns false when signature header is missing the sha256= prefix', () => {
    const body = JSON.stringify({ test: 'payload' })
    const bareHex = createHmac('sha256', TEST_SECRET).update(body, 'utf8').digest('hex')
    expect(verifyWhatsAppSignature(body, bareHex, TEST_SECRET)).toBe(false)
  })

  it('returns false for empty signature', () => {
    const body = JSON.stringify({ test: 'payload' })
    expect(verifyWhatsAppSignature(body, '', TEST_SECRET)).toBe(false)
  })

  it('returns false for malformed hex (odd-length after prefix)', () => {
    const body = JSON.stringify({ test: 'payload' })
    expect(verifyWhatsAppSignature(body, 'sha256=zzz', TEST_SECRET)).toBe(false)
  })

  it('uses the real HMAC of a realistic WhatsApp payload', () => {
    const body = JSON.stringify(sampleText)
    const sig = computeSignature(body, TEST_SECRET)
    expect(verifyWhatsAppSignature(body, sig, TEST_SECRET)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// mapWhatsAppInbound — mensagem de texto
// ---------------------------------------------------------------------------

describe('mapWhatsAppInbound — sample-text.json', () => {
  it('returns a WhatsAppInboundEvent with correct fields', () => {
    const result = mapWhatsAppInbound(sampleText)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('text')
    expect(result!.body).toBe('Olá, gostaria de saber mais sobre os cursos.')
    expect(result!.fromPhoneNumber).toBe('5511900000001')
    expect(result!.fromDisplayName).toBe('João Silva')
    expect(result!.phoneNumberId).toBe('106540352242922')
    expect(result!.externalMessageId).toBe(
      'wamid.HBgLNTUxMTkwMDAwMDAxFQIAERgSQUMyRTQ2MkI4QzQwMDAwMDAwAA==',
    )
    // timestamp 1700000000 → Date
    expect(result!.sentAt).toEqual(new Date(1700000000 * 1000))
  })

  it('has no mediaId for text messages', () => {
    const result = mapWhatsAppInbound(sampleText)
    expect(result!.mediaId).toBeUndefined()
    expect(result!.mediaMimeType).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// mapWhatsAppInbound — mensagem de imagem
// ---------------------------------------------------------------------------

describe('mapWhatsAppInbound — sample-image.json', () => {
  it('returns a WhatsAppInboundEvent with kind=image', () => {
    const result = mapWhatsAppInbound(sampleImage)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('image')
    expect(result!.fromPhoneNumber).toBe('5511900000002')
    expect(result!.fromDisplayName).toBe('Maria Santos')
    expect(result!.phoneNumberId).toBe('106540352242922')
    expect(result!.body).toBe('Segue meu comprovante')
    expect(result!.mediaId).toBe('1234567890123456')
    expect(result!.mediaMimeType).toBe('image/jpeg')
  })
})

// ---------------------------------------------------------------------------
// mapWhatsAppInbound — status update (deve retornar null)
// ---------------------------------------------------------------------------

describe('mapWhatsAppInbound — sample-status.json (status update)', () => {
  it('returns null because there are no inbound messages', () => {
    const result = mapWhatsAppInbound(sampleStatus)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// mapWhatsAppInbound — payloads inválidos
// ---------------------------------------------------------------------------

describe('mapWhatsAppInbound — payloads inválidos', () => {
  it('returns null for null input', () => {
    expect(mapWhatsAppInbound(null)).toBeNull()
  })

  it('returns null for empty object', () => {
    expect(mapWhatsAppInbound({})).toBeNull()
  })

  it('returns null for payload without entry array', () => {
    expect(mapWhatsAppInbound({ object: 'whatsapp_business_account' })).toBeNull()
  })

  it('returns null for payload with empty changes', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: '123', changes: [] }],
    }
    expect(mapWhatsAppInbound(payload)).toBeNull()
  })

  it('returns null for payload with unsupported message type', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550100000',
                  phone_number_id: '106540352242922',
                },
                contacts: [{ profile: { name: 'Test User' }, wa_id: '5511999999999' }],
                messages: [
                  {
                    from: '5511999999999',
                    id: 'wamid.test',
                    timestamp: '1700000000',
                    type: 'location', // tipo não suportado
                    location: { latitude: -23.5, longitude: -46.6 },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    }
    expect(mapWhatsAppInbound(payload)).toBeNull()
  })

  it('returns null when contacts array is missing', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550100000',
                  phone_number_id: '106540352242922',
                },
                // sem contacts
                messages: [
                  {
                    from: '5511999999999',
                    id: 'wamid.test',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'hello' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    }
    expect(mapWhatsAppInbound(payload)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Verificação de idempotência lógica no mapper (função pura)
// ---------------------------------------------------------------------------

describe('mapWhatsAppInbound — determinismo', () => {
  it('returns the same result when called twice with the same payload', () => {
    const r1 = mapWhatsAppInbound(sampleText)
    const r2 = mapWhatsAppInbound(sampleText)
    expect(r1).toEqual(r2)
  })
})

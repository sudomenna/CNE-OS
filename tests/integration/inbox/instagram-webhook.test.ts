/**
 * T-3-08 — Instagram Direct adapter integration tests
 *
 * Tests:
 *   1. verifyInstagramSignature — valid signature → true
 *   2. verifyInstagramSignature — invalid signature → false
 *   3. mapInstagramInbound — sample-dm.json → returns InstagramInboundEvent
 *   4. mapInstagramInbound — read receipt payload → null
 *   5. mapInstagramInbound — delivery notification → null
 *   6. mapInstagramInbound — echo message → null
 *   7. mapInstagramInbound — image attachment
 *   8. mapInstagramInbound — missing 'messaging' field → null
 *   9. externalMessageId format matches ADR-16 pattern
 *  10. mapInstagramInbound — non-instagram object type → null
 *
 * Nota: HMAC é calculado com segredo de teste — nunca mockado
 * (conforme requisito da tarefa T-3-08).
 *
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 * docs/90-meta/04-decision-log.md §ADR-16
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyInstagramSignature } from '@/lib/integrations/instagram/webhook'
import { mapInstagramInbound, type InstagramInboundEvent } from '@/lib/integrations/instagram/map'
import sampleDm from '@/lib/integrations/instagram/fixtures/sample-dm.json'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-instagram-app-secret-12345'

function signBody(body: string, secret: string = TEST_SECRET): string {
  const hex = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  return `sha256=${hex}`
}

// ---------------------------------------------------------------------------
// Signature verification tests
// ---------------------------------------------------------------------------

describe('verifyInstagramSignature', () => {
  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = JSON.stringify(sampleDm)
    const sig = signBody(body)
    expect(verifyInstagramSignature(body, sig, TEST_SECRET)).toBe(true)
  })

  it('returns false for an invalid signature (wrong secret)', () => {
    const body = JSON.stringify(sampleDm)
    const sig = signBody(body, 'wrong-secret')
    expect(verifyInstagramSignature(body, sig, TEST_SECRET)).toBe(false)
  })

  it('returns false for a tampered body', () => {
    const body = JSON.stringify(sampleDm)
    const sig = signBody(body)
    const tampered = body + ' '
    expect(verifyInstagramSignature(tampered, sig, TEST_SECRET)).toBe(false)
  })

  it('returns false when signature header is missing prefix sha256=', () => {
    const body = JSON.stringify(sampleDm)
    const hex = createHmac('sha256', TEST_SECRET).update(body, 'utf8').digest('hex')
    // No "sha256=" prefix
    expect(verifyInstagramSignature(body, hex, TEST_SECRET)).toBe(false)
  })

  it('returns false for empty signature', () => {
    expect(verifyInstagramSignature('{}', '', TEST_SECRET)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Mapper tests
// ---------------------------------------------------------------------------

describe('mapInstagramInbound', () => {
  it('maps sample-dm.json to a valid InstagramInboundEvent', () => {
    const result = mapInstagramInbound(sampleDm)

    expect(result).not.toBeNull()
    const event = result as InstagramInboundEvent

    // ADR-16: format 'instagram:{mid}'
    expect(event.externalMessageId).toBe('instagram:aGlzdGFncmFtX21zZ19pZF9maXh0dXJl')
    expect(event.externalThreadId).toBe('200000000000002')
    expect(event.fromInstagramId).toBe('200000000000002')
    expect(event.fromDisplayName).toBe('')
    expect(event.body).toBe('Olá, gostaria de saber mais sobre o curso.')
    expect(event.kind).toBe('text')
    expect(event.mediaUrl).toBeUndefined()
    expect(event.pageId).toBe('100000000000001')
    expect(event.sentAt).toBeInstanceOf(Date)
    expect(event.sentAt.getTime()).toBe(1714000000000)
  })

  it('returns null for a read receipt event', () => {
    const readReceipt = {
      object: 'instagram',
      entry: [
        {
          id: '100000000000001',
          time: 1714000001000,
          messaging: [
            {
              sender: { id: '200000000000002' },
              recipient: { id: '100000000000001' },
              timestamp: 1714000001000,
              read: { watermark: 1714000000000 },
            },
          ],
        },
      ],
    }
    expect(mapInstagramInbound(readReceipt)).toBeNull()
  })

  it('returns null for a delivery notification event', () => {
    const delivery = {
      object: 'instagram',
      entry: [
        {
          id: '100000000000001',
          time: 1714000002000,
          messaging: [
            {
              sender: { id: '200000000000002' },
              recipient: { id: '100000000000001' },
              timestamp: 1714000002000,
              delivery: {
                watermark: 1714000000000,
                mids: ['aGlzdGFncmFtX21zZ19pZF9maXh0dXJl'],
              },
            },
          ],
        },
      ],
    }
    expect(mapInstagramInbound(delivery)).toBeNull()
  })

  it('returns null for an echo message (is_echo=true)', () => {
    const echo = {
      object: 'instagram',
      entry: [
        {
          id: '100000000000001',
          time: 1714000003000,
          messaging: [
            {
              sender: { id: '100000000000001' },
              recipient: { id: '200000000000002' },
              timestamp: 1714000003000,
              message: {
                mid: 'echo_mid_001',
                text: 'Resposta do atendente',
                is_echo: true,
              },
            },
          ],
        },
      ],
    }
    expect(mapInstagramInbound(echo)).toBeNull()
  })

  it('maps an image attachment correctly', () => {
    const imageMsg = {
      object: 'instagram',
      entry: [
        {
          id: '100000000000001',
          time: 1714000004000,
          messaging: [
            {
              sender: { id: '200000000000002' },
              recipient: { id: '100000000000001' },
              timestamp: 1714000004000,
              message: {
                mid: 'img_mid_001',
                attachments: [
                  {
                    type: 'image',
                    payload: { url: 'https://cdn.instagram.com/fixture-image.jpg' },
                  },
                ],
              },
            },
          ],
        },
      ],
    }

    const result = mapInstagramInbound(imageMsg)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('image')
    expect(result!.mediaUrl).toBe('https://cdn.instagram.com/fixture-image.jpg')
    expect(result!.externalMessageId).toBe('instagram:img_mid_001')
  })

  it('returns null when messaging array is empty', () => {
    const noMessaging = {
      object: 'instagram',
      entry: [
        {
          id: '100000000000001',
          time: 1714000005000,
          messaging: [],
        },
      ],
    }
    expect(mapInstagramInbound(noMessaging)).toBeNull()
  })

  it('returns null when object type is not instagram', () => {
    const wrongObject = {
      object: 'whatsapp_business_account',
      entry: [{ id: '100000000000001', time: 1714000006000, messaging: [] }],
    }
    expect(mapInstagramInbound(wrongObject)).toBeNull()
  })

  it('returns null for null input', () => {
    expect(mapInstagramInbound(null)).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(mapInstagramInbound('not-an-object')).toBeNull()
  })

  it('externalMessageId follows ADR-16 format instagram:{mid}', () => {
    const result = mapInstagramInbound(sampleDm)
    expect(result).not.toBeNull()
    // ADR-16: must start with 'instagram:'
    expect(result!.externalMessageId).toMatch(/^instagram:/)
  })
})

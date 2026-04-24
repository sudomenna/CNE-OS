/**
 * T-3-09 — Email adapter mapper tests
 *
 * Testa a função pura mapInboundEmail com fixtures reais anonimizadas.
 * Cobertura:
 *   1. Happy path com fixture sample-email.json → retorna ParsedEmail correto
 *   2. messageId ausente → null
 *   3. messageId vazio → null
 *   4. from ausente → null
 *   5. from vazio → null
 *   6. Normalização de from para lowercase
 *   7. Extração de endereço de campo "Nome <email>" → endereço sem nome
 *   8. Extração de nome de exibição
 *   9. Preferência de text/plain sobre text/html para body
 *  10. Corpo vazio quando text e html ausentes
 *  11. Normalização de messageId (remoção de < >)
 *  12. Propagação de inReplyTo
 *  13. sentAt deriva de date string ISO
 *  14. sentAt usa now() quando date ausente
 *  15. ADR-16: messageId sem < > é external_message_id canônico
 *
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 * docs/90-meta/04-decision-log.md §ADR-16
 */
import { describe, it, expect } from 'vitest'
import { mapInboundEmail, type ParsedEmail } from '@/lib/integrations/email/map'
import sampleEmail from '@/lib/integrations/email/fixtures/sample-email.json'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapInboundEmail', () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it('maps sample-email.json fixture correctly', () => {
    const result = mapInboundEmail(sampleEmail)

    expect(result).not.toBeNull()
    const email = result as ParsedEmail

    // messageId sem < >
    expect(email.messageId).toBe('CABcDeFgHiJkLmNoPqRsTuVwXyZ1234567890@mail.gmail.com')
    // from lowercase, apenas endereço
    expect(email.from).toBe('maria.silva@example.com')
    // nome extraído
    expect(email.fromName).toBe('Maria Silva')
    // assunto
    expect(email.subject).toBe('Dúvida sobre o curso de Marketing Digital')
    // body prefer text/plain
    expect(email.body).toContain('gostaria de saber mais informações')
    // sentAt é Date
    expect(email.sentAt).toBeInstanceOf(Date)
    expect(email.sentAt.toISOString()).toBe('2024-10-15T14:32:00.000Z')
  })

  // ── Campos obrigatórios ───────────────────────────────────────────────────

  it('returns null when messageId is absent', () => {
    const { messageId: _omit, ...rest } = sampleEmail
    expect(mapInboundEmail(rest)).toBeNull()
  })

  it('returns null when messageId is empty string', () => {
    expect(mapInboundEmail({ ...sampleEmail, messageId: '' })).toBeNull()
  })

  it('returns null when messageId is whitespace only', () => {
    expect(mapInboundEmail({ ...sampleEmail, messageId: '   ' })).toBeNull()
  })

  it('returns null when from is absent', () => {
    const { from: _omit, ...rest } = sampleEmail
    expect(mapInboundEmail(rest)).toBeNull()
  })

  it('returns null when from is empty string', () => {
    expect(mapInboundEmail({ ...sampleEmail, from: '' })).toBeNull()
  })

  // ── Normalização de from ──────────────────────────────────────────────────

  it('normalizes from address to lowercase', () => {
    const result = mapInboundEmail({ ...sampleEmail, from: 'JOAO.SILVA@EXAMPLE.COM' })
    expect(result?.from).toBe('joao.silva@example.com')
  })

  it('normalizes from address in "Name <email>" format to lowercase', () => {
    const result = mapInboundEmail({ ...sampleEmail, from: 'João Silva <JOAO.SILVA@EXAMPLE.COM>' })
    expect(result?.from).toBe('joao.silva@example.com')
  })

  it('extracts display name from "Name <email>" format', () => {
    const result = mapInboundEmail({
      ...sampleEmail,
      from: 'Ana Paula <ana.paula@example.com>',
    })
    expect(result?.fromName).toBe('Ana Paula')
  })

  it('returns empty fromName when from has no display name', () => {
    const result = mapInboundEmail({ ...sampleEmail, from: 'joao@example.com' })
    expect(result?.fromName).toBe('')
  })

  // ── Body preference ───────────────────────────────────────────────────────

  it('prefers text/plain over text/html for body', () => {
    const result = mapInboundEmail({
      ...sampleEmail,
      text: 'Texto plano aqui',
      html: '<p>HTML aqui</p>',
    })
    expect(result?.body).toBe('Texto plano aqui')
  })

  it('falls back to html when text is absent', () => {
    const { text: _omit, ...rest } = sampleEmail
    const result = mapInboundEmail({
      ...rest,
      html: '<p>Conteúdo HTML</p>',
    })
    expect(result?.body).toBe('<p>Conteúdo HTML</p>')
  })

  it('returns empty string for body when both text and html are absent', () => {
    const { text: _t, html: _h, ...rest } = sampleEmail
    const result = mapInboundEmail(rest)
    expect(result?.body).toBe('')
  })

  // ── messageId normalização ────────────────────────────────────────────────

  it('strips angle brackets from messageId (ADR-16)', () => {
    const result = mapInboundEmail({
      ...sampleEmail,
      messageId: '<abc123@example.com>',
    })
    expect(result?.messageId).toBe('abc123@example.com')
  })

  it('keeps messageId unchanged when no angle brackets', () => {
    const result = mapInboundEmail({
      ...sampleEmail,
      messageId: 'plain-id@example.com',
    })
    expect(result?.messageId).toBe('plain-id@example.com')
  })

  // ── inReplyTo ─────────────────────────────────────────────────────────────

  it('propagates inReplyTo when present (normalized)', () => {
    const result = mapInboundEmail({
      ...sampleEmail,
      inReplyTo: '<original-message@example.com>',
    })
    expect(result?.inReplyTo).toBe('original-message@example.com')
  })

  it('omits inReplyTo when absent', () => {
    const result = mapInboundEmail(sampleEmail)
    expect(result?.inReplyTo).toBeUndefined()
  })

  // ── sentAt ────────────────────────────────────────────────────────────────

  it('parses date from ISO string', () => {
    const result = mapInboundEmail({
      ...sampleEmail,
      date: '2025-01-01T10:00:00.000Z',
    })
    expect(result?.sentAt).toBeInstanceOf(Date)
    expect(result?.sentAt.toISOString()).toBe('2025-01-01T10:00:00.000Z')
  })

  it('uses provided Date object directly', () => {
    const d = new Date('2025-06-15T08:30:00.000Z')
    const result = mapInboundEmail({ ...sampleEmail, date: d })
    expect(result?.sentAt).toEqual(d)
  })

  it('falls back to approximately now() when date is absent', () => {
    const before = Date.now()
    const { date: _omit, ...rest } = sampleEmail
    const result = mapInboundEmail(rest)
    const after = Date.now()
    expect(result?.sentAt).toBeInstanceOf(Date)
    expect(result!.sentAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(result!.sentAt.getTime()).toBeLessThanOrEqual(after)
  })

  // ── subject ───────────────────────────────────────────────────────────────

  it('uses empty string for subject when absent', () => {
    const { subject: _omit, ...rest } = sampleEmail
    const result = mapInboundEmail(rest)
    expect(result?.subject).toBe('')
  })
})

/**
 * MOD-INBOX — Instagram webhook signature verification
 *
 * Instagram Direct uses the same Meta Graph API webhook protocol as WhatsApp.
 * Signature header: X-Hub-Signature-256 = sha256=<HMAC-SHA256(body, appSecret)>
 *
 * ADR-16: externalEventId format = 'instagram:{provider_event_id}'
 * docs/40-integrations/ — Meta webhook canonical flow
 */
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verifies the HMAC-SHA256 signature of an Instagram webhook request.
 *
 * @param rawBody   - Raw UTF-8 request body string
 * @param signature - Value of the X-Hub-Signature-256 header (format: "sha256=<hex>")
 * @param appSecret - Instagram App Secret (process.env.INSTAGRAM_APP_SECRET)
 * @returns true if signature is valid, false otherwise
 */
export function verifyInstagramSignature(
  rawBody: string,
  signature: string,
  appSecret: string,
): boolean {
  if (!signature.startsWith('sha256=')) return false

  const expected = createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex')

  const provided = signature.slice('sha256='.length)

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'))
  } catch {
    // Buffer.from may throw if hex strings have different lengths
    return false
  }
}

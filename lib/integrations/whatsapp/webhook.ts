/**
 * MOD-INBOX / T-3-07 — WhatsApp Business Official: assinatura HMAC-SHA256
 *
 * docs/30-contracts/04-webhook-contracts.md §5.3
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 *
 * A Meta envia o header X-Hub-Signature-256 com o valor "sha256=<hex>".
 * A verificação usa crypto.timingSafeEqual para prevenir timing attacks.
 */
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verifica a assinatura HMAC-SHA256 do webhook da Meta / WhatsApp Cloud API.
 *
 * @param rawBody   - Corpo bruto da requisição (string, antes de qualquer parse)
 * @param signature - Valor do header X-Hub-Signature-256 (formato "sha256=<hex>")
 * @param appSecret - Segredo do app Meta (WHATSAPP_APP_SECRET)
 * @returns true se a assinatura for válida, false caso contrário
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  signature: string,
  appSecret: string,
): boolean {
  if (!signature.startsWith('sha256=')) {
    return false
  }

  const receivedHex = signature.slice('sha256='.length)
  const computed = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')

  // Comparação em tempo constante — previne timing attack
  try {
    const receivedBuf = Buffer.from(receivedHex, 'hex')
    const computedBuf = Buffer.from(computed, 'hex')

    // Buffer lengths must match for timingSafeEqual; se divergirem, assinatura inválida
    if (receivedBuf.length !== computedBuf.length) {
      return false
    }

    return timingSafeEqual(receivedBuf, computedBuf)
  } catch {
    return false
  }
}

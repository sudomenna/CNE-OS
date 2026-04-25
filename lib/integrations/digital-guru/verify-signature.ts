/**
 * MOD-INTEGRATION / T-8-13 — Digital Guru: verificação de assinatura HMAC-SHA256
 *
 * docs/40-integrations/01-digital-guru.md
 * docs/30-contracts/04-webhook-contracts.md §5.1
 *
 * O Digital Guru envia o header X-Guru-Signature com o valor hex do HMAC-SHA256
 * do rawBody usando DIGITAL_GURU_WEBHOOK_SECRET. A verificação usa
 * crypto.timingSafeEqual para prevenir timing attacks.
 */
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verifica a assinatura HMAC-SHA256 do webhook do Digital Guru.
 *
 * @param payload   - Corpo bruto da requisição (string, antes de qualquer parse)
 * @param signature - Valor do header X-Guru-Signature (hex puro, sem prefixo)
 * @param secret    - Segredo HMAC (DIGITAL_GURU_WEBHOOK_SECRET)
 * @returns true se a assinatura for válida, false caso contrário
 *
 * Função pura — sem I/O, determinística, testável isoladamente.
 */
export function verifyDigitalGuruSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) {
    return false
  }

  const computed = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')

  // Comparação em tempo constante — previne timing attack
  try {
    const receivedBuf = Buffer.from(signature, 'hex')
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

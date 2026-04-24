/**
 * MOD-INBOX / T-3-09 — Email adapter: mapper puro
 *
 * Transforma um objeto de e-mail parseado (nodemailer/mailparser) no tipo
 * canônico interno ParsedEmail. Função pura: zero I/O, zero efeito colateral,
 * sem imports de nodemailer ou imap-simple.
 *
 * ADR-16: externalMessageId = messageId sem < >
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 * docs/20-domain/05-conversation-inbox.md
 */

// ---------------------------------------------------------------------------
// Tipo público exportado
// ---------------------------------------------------------------------------

export type ParsedEmail = {
  /** Message-Id header sem < > — usado como external_message_id (ADR-16) */
  messageId: string
  /** Endereço e-mail do remetente (lowercase) */
  from: string
  /** Nome de exibição do remetente */
  fromName: string
  /** Assunto do e-mail */
  subject: string
  /** Corpo do e-mail em texto plano (preferência sobre text/html) */
  body: string
  /** Timestamp de envio */
  sentAt: Date
  /** In-Reply-To header — presente quando é resposta a outro e-mail (threading) */
  inReplyTo?: string
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Extrai endereço de e-mail de um campo "From" que pode estar em formato:
 *   - "Nome Completo <email@example.com>"
 *   - "email@example.com"
 * Retorna o endereço em lowercase.
 */
function extractEmailAddress(from: string): string {
  const angleMatch = from.match(/<([^>]+)>/)
  if (angleMatch?.[1]) {
    return angleMatch[1].trim().toLowerCase()
  }
  return from.trim().toLowerCase()
}

/**
 * Extrai o nome de exibição de um campo "From".
 * Retorna string vazia quando apenas o endereço está presente.
 */
function extractDisplayName(from: string): string {
  const angleMatch = from.match(/^(.+)<[^>]+>/)
  if (angleMatch?.[1]) {
    return angleMatch[1].trim().replace(/^"|"$/g, '')
  }
  return ''
}

/**
 * Remove < > do Message-Id quando presentes.
 * Normaliza para uso como external_message_id.
 */
function normalizeMessageId(messageId: string): string {
  return messageId.replace(/^<|>$/g, '').trim()
}

// ---------------------------------------------------------------------------
// Função pública
// ---------------------------------------------------------------------------

/**
 * Mapeia um objeto de e-mail bruto para o tipo canônico ParsedEmail.
 *
 * Retorna null quando:
 *   - `messageId` ausente ou vazio (não é possível garantir idempotência)
 *   - `from` ausente ou vazio (remetente desconhecido)
 *
 * É pura e determinística: mesma entrada → mesma saída.
 */
export function mapInboundEmail(raw: {
  messageId?: string
  from?: string
  subject?: string
  text?: string
  html?: string
  date?: Date | string
  inReplyTo?: string
}): ParsedEmail | null {
  // Campos obrigatórios para idempotência e resolução de identidade
  if (!raw.messageId || raw.messageId.trim() === '') {
    return null
  }
  if (!raw.from || raw.from.trim() === '') {
    return null
  }

  const messageId = normalizeMessageId(raw.messageId)
  const fromAddress = extractEmailAddress(raw.from)
  const fromName = extractDisplayName(raw.from)

  // Preferir text/plain sobre text/html para body canônico
  const body = raw.text?.trim() || raw.html?.trim() || ''

  const sentAt =
    raw.date instanceof Date
      ? raw.date
      : raw.date
        ? new Date(raw.date)
        : new Date()

  const result: ParsedEmail = {
    messageId,
    from: fromAddress,
    fromName,
    subject: raw.subject?.trim() ?? '',
    body,
    sentAt,
  }

  if (raw.inReplyTo) {
    result.inReplyTo = normalizeMessageId(raw.inReplyTo)
  }

  return result
}

/**
 * MOD-INBOX / T-3-09 — Email adapter: IMAP polling
 *
 * Conecta via IMAP, busca mensagens não-lidas em INBOX, chama o callback
 * para cada mensagem parseada e marca como lida. Erros por mensagem são
 * capturados sem abortar o lote.
 *
 * Dependências: imap-simple, mailparser
 * docs/20-domain/05-conversation-inbox.md
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import imapSimple, { type ImapSimpleOptions, type Message } from 'imap-simple'
import { simpleParser } from 'mailparser'
import { mapInboundEmail, type ParsedEmail } from './map'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ImapConfig = {
  host: string
  port: number
  user: string
  password: string
  /** Usar TLS. Default: true */
  tls?: boolean
}

// ---------------------------------------------------------------------------
// pollImap
// ---------------------------------------------------------------------------

/**
 * Conecta ao servidor IMAP, busca mensagens não-lidas em INBOX e processa
 * cada uma via o callback `onMessage`.
 *
 * Comportamento:
 * - Mensagens com `messageId` ou `from` ausentes (mapInboundEmail → null) são
 *   marcadas como lidas silenciosamente (sem callback).
 * - Erros por mensagem individual são capturados via console.error; o lote
 *   continua processando as demais mensagens.
 * - Sempre fecha a conexão IMAP no finally.
 *
 * @returns Quantidade de mensagens em que `onMessage` foi chamado com sucesso.
 */
export async function pollImap(
  config: ImapConfig,
  onMessage: (raw: ParsedEmail) => Promise<void>,
): Promise<number> {
  const imapConfig: ImapSimpleOptions = {
    imap: {
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      tls: config.tls ?? true,
      // Aumenta timeout para evitar desconexões em servidores lentos
      authTimeout: 10000,
    },
  }

  const connection = await imapSimple.connect(imapConfig)

  try {
    await connection.openBox('INBOX')

    // Busca mensagens não-lidas (UNSEEN)
    const messages: Message[] = await connection.search(['UNSEEN'], {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false, // marcamos manualmente após processamento
      struct: true,
    })

    let processed = 0

    for (const msg of messages) {
      // Parte '' contém o e-mail completo (RFC 822)
      const fullPart = msg.parts.find((p) => p.which === '')
      if (!fullPart) continue

      const rawBody: string =
        typeof fullPart.body === 'string' ? fullPart.body : String(fullPart.body)

      let parsed: ParsedEmail | null = null

      try {
        const mail = await simpleParser(rawBody)

        const rawInput: {
          messageId?: string
          from?: string
          subject?: string
          text?: string
          html?: string
          date?: Date | string
          inReplyTo?: string
        } = {}
        if (mail.messageId) rawInput.messageId = mail.messageId
        if (mail.from?.text) rawInput.from = mail.from.text
        if (mail.subject) rawInput.subject = mail.subject
        if (mail.text) rawInput.text = mail.text
        if (typeof mail.html === 'string') rawInput.html = mail.html
        if (mail.date) rawInput.date = mail.date
        if (mail.inReplyTo) rawInput.inReplyTo = mail.inReplyTo

        parsed = mapInboundEmail(rawInput)
      } catch (parseErr) {
        console.error('[email-poll] failed to parse message', { error: parseErr })
        // Marca como lida para não reprocessar em próxima rodada
        await connection.addFlags(msg.attributes.uid, ['\\Seen'])
        continue
      }

      if (!parsed) {
        // messageId ou from ausente — marca como lida, sem callback
        await connection.addFlags(msg.attributes.uid, ['\\Seen'])
        continue
      }

      try {
        await onMessage(parsed)
        // Marca como lida apenas após processamento bem-sucedido
        await connection.addFlags(msg.attributes.uid, ['\\Seen'])
        processed++
      } catch (callbackErr) {
        // Erro no callback (ex: DB) — não marca como lida para tentar novamente
        console.error('[email-poll] onMessage callback failed', {
          messageId: parsed.messageId,
          error: callbackErr,
        })
      }
    }

    return processed
  } finally {
    connection.end()
  }
}

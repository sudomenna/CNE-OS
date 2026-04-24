/**
 * MOD-INBOX / T-3-09 — Email adapter: envio SMTP
 *
 * Envia e-mail via SMTP usando nodemailer. Retorna o messageId gerado
 * pelo servidor para uso como external_message_id em outbound.
 *
 * Dependências: nodemailer
 * docs/20-domain/05-conversation-inbox.md
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import nodemailer from 'nodemailer'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type SmtpConfig = {
  host: string
  port: number
  user: string
  password: string
  /** Usar TLS/STARTTLS. Default: true quando port === 465, STARTTLS caso contrário */
  secure?: boolean
}

export type SendEmailInput = {
  /** Endereço de destino */
  to: string
  /** Assunto do e-mail */
  subject: string
  /** Corpo em texto plano */
  body: string
  /** Message-Id do e-mail original para threading (In-Reply-To) */
  inReplyTo?: string
  /** Message-Id para o header References (threading completo) */
  messageId?: string
}

// ---------------------------------------------------------------------------
// sendEmail
// ---------------------------------------------------------------------------

/**
 * Envia um e-mail via SMTP e retorna o messageId gerado.
 *
 * O messageId retornado é o valor do header Message-Id gerado pelo nodemailer
 * (sem < >), adequado para uso como external_message_id em outbound.
 *
 * @throws Propaga erros do nodemailer (conexão, autenticação, rejeição SMTP).
 */
export async function sendEmail(
  config: SmtpConfig,
  input: SendEmailInput,
): Promise<{ messageId: string }> {
  const secure = config.secure ?? config.port === 465

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
  })

  const mailOptions: nodemailer.SendMailOptions = {
    from: config.user,
    to: input.to,
    subject: input.subject,
    text: input.body,
    ...(input.inReplyTo ? { inReplyTo: `<${input.inReplyTo}>` } : {}),
    ...(input.messageId
      ? { references: `<${input.inReplyTo ?? input.messageId}>` }
      : {}),
  }

  const info = await transporter.sendMail(mailOptions)

  // nodemailer retorna messageId no formato <...@...>; normalizar removendo < >
  const rawMessageId: string = info.messageId ?? ''
  const messageId = rawMessageId.replace(/^<|>$/g, '')

  return { messageId }
}

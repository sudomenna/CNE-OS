/**
 * MOD-INBOX / T-3-07 — WhatsApp Business Official: mapper puro
 *
 * Transforma o payload bruto da Meta/WhatsApp Cloud API no tipo canônico
 * interno WhatsAppInboundEvent. Função pura: zero I/O, zero efeito colateral.
 *
 * docs/30-contracts/04-webhook-contracts.md §5.3
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Tipo público exportado — entrada para o processor Inngest
// ---------------------------------------------------------------------------

export type WhatsAppMessageKind =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'

export type WhatsAppInboundEvent = {
  /** ID único da mensagem no provedor (wamid.*) — usado como external_message_id */
  externalMessageId: string
  /** ID do thread/conversa no provedor (conversation.id do payload, se presente) */
  externalThreadId: string | null
  /** Número do remetente em E.164 (contacts[0].wa_id) */
  fromPhoneNumber: string
  /** Nome de exibição do remetente (contacts[0].profile.name) */
  fromDisplayName: string
  /** Corpo textual da mensagem (text.body) ou descrição fallback para mídia */
  body: string
  /** Tipo da mensagem */
  kind: WhatsAppMessageKind
  /** URL da mídia — presente em mensagens de imagem, vídeo, áudio, documento */
  mediaId?: string
  /** MIME type da mídia quando disponível */
  mediaMimeType?: string
  /** Timestamp de envio (messages[].timestamp — unix epoch → Date) */
  sentAt: Date
  /** ID do número de telefone Meta que recebeu a mensagem — identifica channel_account */
  phoneNumberId: string
}

// ---------------------------------------------------------------------------
// Schema Zod interno (não exportado) — valida estrutura mínima do payload Meta
// ---------------------------------------------------------------------------

const whatsAppMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z
    .object({
      body: z.string(),
    })
    .optional(),
  image: z
    .object({
      id: z.string().optional(),
      mime_type: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
  video: z
    .object({
      id: z.string().optional(),
      mime_type: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
  audio: z
    .object({
      id: z.string().optional(),
      mime_type: z.string().optional(),
    })
    .optional(),
  document: z
    .object({
      id: z.string().optional(),
      mime_type: z.string().optional(),
      caption: z.string().optional(),
      filename: z.string().optional(),
    })
    .optional(),
  sticker: z
    .object({
      id: z.string().optional(),
      mime_type: z.string().optional(),
    })
    .optional(),
})

const whatsAppContactSchema = z.object({
  profile: z.object({
    name: z.string(),
  }),
  wa_id: z.string(),
})

const whatsAppValueSchema = z.object({
  messaging_product: z.string(),
  metadata: z.object({
    display_phone_number: z.string(),
    phone_number_id: z.string(),
  }),
  contacts: z.array(whatsAppContactSchema).optional(),
  messages: z.array(whatsAppMessageSchema).optional(),
  statuses: z.array(z.record(z.unknown())).optional(),
})

const whatsAppChangeSchema = z.object({
  value: whatsAppValueSchema,
  field: z.string(),
})

const whatsAppPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(whatsAppChangeSchema),
    }),
  ),
})

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function resolveKind(type: string): WhatsAppMessageKind | null {
  switch (type) {
    case 'text':
      return 'text'
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'audio':
      return 'audio'
    case 'document':
      return 'document'
    case 'sticker':
      return 'sticker'
    default:
      return null
  }
}

function resolveBody(msg: z.infer<typeof whatsAppMessageSchema>): string {
  switch (msg.type) {
    case 'text':
      return msg.text?.body ?? ''
    case 'image':
      return msg.image?.caption ?? '[imagem]'
    case 'video':
      return msg.video?.caption ?? '[vídeo]'
    case 'audio':
      return '[áudio]'
    case 'document':
      return msg.document?.caption ?? msg.document?.filename ?? '[documento]'
    case 'sticker':
      return '[sticker]'
    default:
      return '[mensagem]'
  }
}

function resolveMediaId(
  msg: z.infer<typeof whatsAppMessageSchema>,
): string | undefined {
  return (
    msg.image?.id ??
    msg.video?.id ??
    msg.audio?.id ??
    msg.document?.id ??
    msg.sticker?.id
  )
}

function resolveMediaMimeType(
  msg: z.infer<typeof whatsAppMessageSchema>,
): string | undefined {
  return (
    msg.image?.mime_type ??
    msg.video?.mime_type ??
    msg.audio?.mime_type ??
    msg.document?.mime_type ??
    msg.sticker?.mime_type
  )
}

// ---------------------------------------------------------------------------
// Função pública
// ---------------------------------------------------------------------------

/**
 * Mapeia um payload bruto da Meta/WhatsApp Cloud API para o tipo canônico interno.
 *
 * Retorna null quando:
 *   - O payload não contém mensagens (ex: status updates, read receipts)
 *   - O payload está malformado (falha no schema Zod)
 *   - O tipo de mensagem não é suportado
 *
 * É puro e determinístico: mesma entrada → mesma saída.
 */
export function mapWhatsAppInbound(payload: unknown): WhatsAppInboundEvent | null {
  const parsed = whatsAppPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    return null
  }

  const data = parsed.data

  // Percorre entry[].changes[] procurando o primeiro conjunto de mensagens válido
  for (const entry of data.entry) {
    for (const change of entry.changes) {
      const { value } = change

      // Payload sem messages (ex: status updates) → retornar null
      if (!value.messages || value.messages.length === 0) {
        continue
      }

      const msg = value.messages[0]
      if (!msg) continue

      const contact = value.contacts?.[0]
      if (!contact) continue

      const kind = resolveKind(msg.type)
      if (!kind) continue

      const body = resolveBody(msg)
      const mediaId = resolveMediaId(msg)
      const mediaMimeType = resolveMediaMimeType(msg)

      const event: WhatsAppInboundEvent = {
        externalMessageId: msg.id,
        externalThreadId: null, // WhatsApp Cloud API não fornece conversation.id em mensagens inbound
        fromPhoneNumber: contact.wa_id,
        fromDisplayName: contact.profile.name,
        body,
        kind,
        sentAt: new Date(parseInt(msg.timestamp, 10) * 1000),
        phoneNumberId: value.metadata.phone_number_id,
        ...(mediaId !== undefined && { mediaId }),
        ...(mediaMimeType !== undefined && { mediaMimeType }),
      }

      return event
    }
  }

  // Nenhuma mensagem encontrada (apenas status updates ou changes vazios)
  return null
}

// ---------------------------------------------------------------------------
// Utilitários para o route handler
// ---------------------------------------------------------------------------

/**
 * Extrai o external_event_id canônico de um payload WhatsApp.
 * Pode retornar múltiplos IDs quando o payload agrupa eventos.
 * docs/30-contracts/04-webhook-contracts.md §5.3
 */
export function extractWhatsAppEventIds(payload: unknown): string[] {
  const parsed = whatsAppPayloadSchema.safeParse(payload)
  if (!parsed.success) return []

  const ids: string[] = []
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const { value } = change
      for (const msg of value.messages ?? []) {
        ids.push(msg.id)
      }
      for (const status of value.statuses ?? []) {
        const statusId = (status as Record<string, unknown>)['id']
        if (typeof statusId === 'string') {
          ids.push(statusId)
        }
      }
    }
  }

  return ids
}

/**
 * MOD-INBOX — Instagram Direct webhook mapper (pure function)
 *
 * Maps a raw Instagram Graph API webhook payload to the canonical
 * InstagramInboundEvent struct. This function is pure and deterministic:
 * same input always yields same output. No DB access, no side effects.
 *
 * ADR-16: externalMessageId = 'instagram:{mid}'
 * docs/20-domain/05-conversation-inbox.md
 */

// ---------------------------------------------------------------------------
// Instagram Graph API webhook payload types (partial — only what we need)
// ---------------------------------------------------------------------------

type InstagramSender = { id: string }
type InstagramRecipient = { id: string }

type InstagramMessageAttachment = {
  type: string
  payload?: { url?: string; sticker_id?: string }
}

type InstagramMessageData = {
  mid: string
  text?: string
  attachments?: InstagramMessageAttachment[]
  sticker_id?: string
  reply_to?: unknown
  is_echo?: boolean
}

type InstagramMessaging = {
  sender: InstagramSender
  recipient: InstagramRecipient
  timestamp: number
  message?: InstagramMessageData
  read?: { watermark: number }
  delivery?: { watermark: number; mids: string[] }
}

type InstagramEntry = {
  id: string
  time: number
  messaging: InstagramMessaging[]
}

type InstagramWebhookPayload = {
  object: string
  entry: InstagramEntry[]
}

// ---------------------------------------------------------------------------
// Canonical output type
// ---------------------------------------------------------------------------

export type InstagramInboundEvent = {
  /** ADR-16: 'instagram:{mid}' */
  externalMessageId: string
  /** Instagram user ID of the sender (used as thread ID) */
  externalThreadId: string
  /** Instagram user ID of the sender */
  fromInstagramId: string
  /**
   * Display name of the sender.
   * Instagram does not send the user name in the webhook payload.
   * Populated as empty string here — callers may enrich via Instagram API separately.
   */
  fromDisplayName: string
  /** Text body of the message */
  body: string
  /** Message media kind */
  kind: 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'share'
  /** URL of the media attachment, if any */
  mediaUrl?: string
  /** When the message was sent (derived from webhook timestamp in ms) */
  sentAt: Date
  /** Instagram Page ID — identifies which channel_account received the message */
  pageId: string
}

// ---------------------------------------------------------------------------
// Kind resolution helper
// ---------------------------------------------------------------------------

function resolveKind(msg: InstagramMessageData): {
  kind: InstagramInboundEvent['kind']
  mediaUrl?: string
} {
  if (msg.sticker_id) return { kind: 'sticker' }

  if (!msg.attachments || msg.attachments.length === 0) {
    return { kind: 'text' }
  }

  const attachment = msg.attachments[0]
  if (!attachment) return { kind: 'text' }

  const type = attachment.type.toLowerCase()
  const url = attachment.payload?.url

  if (type === 'image') {
    return url !== undefined ? { kind: 'image', mediaUrl: url } : { kind: 'image' }
  }
  if (type === 'video') {
    return url !== undefined ? { kind: 'video', mediaUrl: url } : { kind: 'video' }
  }
  if (type === 'audio') {
    return url !== undefined ? { kind: 'audio', mediaUrl: url } : { kind: 'audio' }
  }
  if (type === 'share') {
    return url !== undefined ? { kind: 'share', mediaUrl: url } : { kind: 'share' }
  }
  // Fallback for unknown attachment types
  return url !== undefined ? { kind: 'image', mediaUrl: url } : { kind: 'image' }
}

// ---------------------------------------------------------------------------
// Main mapper — pure function
// ---------------------------------------------------------------------------

/**
 * Maps a raw Instagram webhook payload to an InstagramInboundEvent.
 *
 * Returns null for non-message events (read receipts, delivery notifications,
 * echo messages from the page itself) — these should be acknowledged (200)
 * but not processed further.
 */
export function mapInstagramInbound(payload: unknown): InstagramInboundEvent | null {
  // Basic structure validation
  if (
    typeof payload !== 'object' ||
    payload === null ||
    (payload as Record<string, unknown>)['object'] !== 'instagram'
  ) {
    return null
  }

  const raw = payload as InstagramWebhookPayload

  const entry = raw.entry?.[0]
  if (!entry) return null

  const messaging = entry.messaging?.[0]
  if (!messaging) return null

  // Must be a message event (not read, delivery, etc.)
  if (!messaging.message) return null

  const msg = messaging.message

  // Skip echo messages (messages sent by the page itself, reflected back)
  if (msg.is_echo === true) return null

  const { kind, mediaUrl } = resolveKind(msg)

  // ADR-16: externalMessageId = 'instagram:{mid}'
  const externalMessageId = `instagram:${msg.mid}`

  return {
    externalMessageId,
    externalThreadId: messaging.sender.id,
    fromInstagramId: messaging.sender.id,
    fromDisplayName: '',
    body: msg.text ?? '',
    kind,
    ...(mediaUrl !== undefined ? { mediaUrl } : {}),
    sentAt: new Date(messaging.timestamp),
    pageId: entry.id,
  }
}

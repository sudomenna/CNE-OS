/**
 * Seed: channel catalogue — Fase 1
 * Task: T-3-01
 *
 * Inserts the three canonical channels. Safe to run multiple times
 * (onConflictDoNothing via uq_channel_kind).
 * docs/20-domain/05-conversation-inbox.md §3
 * docs/30-contracts/01-enums.md  (channel_kind)
 */
import { db } from '@/lib/db/client'
import { channel } from '@/lib/db/schema'

export async function seedChannels() {
  await db
    .insert(channel)
    .values([
      { kind: 'whatsapp', name: 'WhatsApp Business' },
      { kind: 'instagram', name: 'Instagram Direct' },
      { kind: 'email', name: 'E-mail' },
    ])
    .onConflictDoNothing()
}

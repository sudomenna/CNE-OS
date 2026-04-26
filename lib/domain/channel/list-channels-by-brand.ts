/**
 * MOD-CHANNEL — listChannelsByBrand
 *
 * T-15-03
 * ADR-10: retorna Promise<ChannelAccountListItem[]> e lança ChannelDomainError
 * ADR-11: função de leitura pura — sem tx (usa db singleton)
 * ADR-18: NUNCA retorna ciphertext nem plaintext — apenas metadados
 *
 * Zero I/O direto: consome db singleton (leitura).
 */
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { channel, channelAccount } from '@/lib/db/schema/conversation'
import type { CredentialEnvelope } from '@/lib/db/crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChannelAccountListItem = {
  id: string
  brandId: string
  channelKind: string
  externalId: string
  displayName: string | null
  isActive: boolean
  /** Data de encriptação das credentials (extraída do envelope, se presente). */
  encryptedAt: string | null
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// listChannelsByBrand
// ---------------------------------------------------------------------------

/**
 * Lista channel_accounts de uma marca com apenas metadados.
 *
 * ADR-18: NUNCA retorna ciphertext nem plaintext das credentials.
 * O campo `encryptedAt` é extraído do envelope jsonb sem decriptar.
 *
 * Função de leitura pura — não recebe tx (ADR-11: leituras puras usam
 * o cliente singleton).
 *
 * @param brandId  UUID da marca
 * @returns        Lista de metadados de channel_accounts
 */
export async function listChannelsByBrand(
  brandId: string,
): Promise<ChannelAccountListItem[]> {
  const rows = await db
    .select({
      id: channelAccount.id,
      brandId: channelAccount.brandId,
      channelKind: channel.kind,
      externalId: channelAccount.externalId,
      displayName: channelAccount.displayName,
      isActive: channelAccount.isActive,
      // ADR-18: credentials como jsonb — extrairemos apenas encryptedAt
      credentials: channelAccount.credentials,
      createdAt: channelAccount.createdAt,
      updatedAt: channelAccount.updatedAt,
    })
    .from(channelAccount)
    .innerJoin(channel, eq(channel.id, channelAccount.channelId))
    .where(eq(channelAccount.brandId, brandId))
    .orderBy(channelAccount.createdAt)

  return rows.map((row) => {
    // ADR-18: extrair apenas encryptedAt do envelope — nunca ciphertext
    let encryptedAt: string | null = null
    if (row.credentials && typeof row.credentials === 'object') {
      const envelope = row.credentials as Partial<CredentialEnvelope>
      if (typeof envelope.encryptedAt === 'string') {
        encryptedAt = envelope.encryptedAt
      }
    }

    return {
      id: row.id,
      brandId: row.brandId,
      channelKind: row.channelKind,
      externalId: row.externalId,
      displayName: row.displayName,
      isActive: row.isActive,
      encryptedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  })
}

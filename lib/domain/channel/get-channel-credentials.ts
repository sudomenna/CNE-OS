/**
 * MOD-CHANNEL — getChannelCredentials
 *
 * T-15-03
 * ADR-10: retorna Promise<Record<string, unknown>> e lança ChannelDomainError
 * ADR-11: função de leitura que decripta — não recebe tx (leitura pura)
 * ADR-18: RESTRITA — só deve ser chamada por adapter no momento do dispatch
 *
 * Zero I/O direto: consome db singleton para leitura e decryptFn para pgcrypto.
 *
 * @security Função restrita. Retorna plaintext das credentials.
 *   Somente adapters em lib/integrations/<provider>/ devem chamá-la,
 *   imediatamente antes de enviar a requisição ao provedor externo.
 *   NUNCA expor resultado em Server Actions de listagem ou UI.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { channelAccount } from '@/lib/db/schema/conversation'
import type { CredentialEnvelope } from '@/lib/db/crypto'
import type { DecryptFn } from './types'
import { ChannelAccountNotFoundError } from './errors'

// ---------------------------------------------------------------------------
// getChannelCredentials
// ---------------------------------------------------------------------------

/**
 * Carrega o channel_account pelo id, decripta as credentials e retorna o plaintext.
 *
 * @security Restrito a adapters de integração no momento do dispatch.
 *   Ver ADR-18.
 *
 * @param id         UUID do channel_account
 * @param decryptFn  Função de decriptação (injetável para testes)
 * @returns          Objeto de credenciais plaintext
 * @throws           ChannelAccountNotFoundError se id não existe
 * @throws           Error se credentials estão ausentes ou malformadas
 */
export async function getChannelCredentials(
  id: string,
  decryptFn: DecryptFn,
): Promise<Record<string, unknown>> {
  const rows = await db
    .select({
      id: channelAccount.id,
      credentials: channelAccount.credentials,
    })
    .from(channelAccount)
    .where(eq(channelAccount.id, id))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new ChannelAccountNotFoundError(id)
  }

  if (!row.credentials || typeof row.credentials !== 'object') {
    throw new Error(
      `getChannelCredentials: channel_account ${id} has no credentials envelope`,
    )
  }

  const envelope = row.credentials as Partial<CredentialEnvelope>

  if (envelope.v !== 1 || !envelope.ciphertext || !envelope.encryptedAt) {
    throw new Error(
      `getChannelCredentials: channel_account ${id} has invalid credential envelope`,
    )
  }

  // ADR-18: decripta via pgcrypto — plaintext fica somente em memória
  return decryptFn(envelope as CredentialEnvelope)
}

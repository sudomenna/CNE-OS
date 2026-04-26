/**
 * MOD-CHANNEL — updateChannelAccount
 *
 * T-15-03
 * ADR-10: retorna Promise<void> e lança ChannelDomainError
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado)
 * ADR-18: re-encripta credentials quando passadas
 *
 * Zero I/O direto: consome tx para DB e encryptFn para pgcrypto.
 */
import { eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { channelAccount } from '@/lib/db/schema/conversation'
import { logAudit } from '@/lib/audit/log'
import type { EncryptFn } from './types'
import { ChannelAccountNotFoundError } from './errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpdateChannelAccountInput = {
  id: string
  credentials?: Record<string, unknown>
  isActive?: boolean
  actorUserId: string
}

// ---------------------------------------------------------------------------
// updateChannelAccount
// ---------------------------------------------------------------------------

/**
 * Atualiza um channel_account existente.
 *
 * Se `credentials` for passado, re-encripta via encryptFn antes de UPDATE.
 * Se `isActive` for passado, atualiza o flag de ativação.
 *
 * audit_log registra apenas as chaves alteradas — nunca os valores de
 * credentials (ADR-18: plaintext nunca trafega fora do adapter de dispatch).
 *
 * @param tx          Transação DB ativa (ADR-11)
 * @param params      Dados a atualizar (credentials e/ou isActive)
 * @param encryptFn   Função de encriptação (injetável para testes)
 * @throws            ChannelAccountNotFoundError se id não existe
 */
export async function updateChannelAccount(
  tx: DbTx,
  params: UpdateChannelAccountInput,
  encryptFn: EncryptFn,
): Promise<void> {
  const { id, credentials, isActive, actorUserId } = params

  // -------------------------------------------------------------------------
  // Verifica existência do channel_account
  // -------------------------------------------------------------------------
  const existingRows = await tx
    .select({
      id: channelAccount.id,
      isActive: channelAccount.isActive,
    })
    .from(channelAccount)
    .where(eq(channelAccount.id, id))
    .limit(1)

  const existing = existingRows[0]
  if (!existing) {
    throw new ChannelAccountNotFoundError(id)
  }

  // -------------------------------------------------------------------------
  // Monta o diff para audit (apenas chaves — nunca valores de credentials)
  // ADR-18: diff payload loga keys alteradas sem valores sensíveis
  // -------------------------------------------------------------------------
  const changedKeys: string[] = []
  const updatePayload: Partial<{
    credentials: Record<string, unknown>
    isActive: boolean
    updatedAt: Date
  }> = {
    updatedAt: new Date(),
  }

  if (credentials !== undefined) {
    // ADR-18: re-encripta antes de persistir
    const envelope = await encryptFn(credentials)
    updatePayload.credentials = envelope as Record<string, unknown>
    changedKeys.push('credentials')
  }

  if (isActive !== undefined && isActive !== existing.isActive) {
    updatePayload.isActive = isActive
    changedKeys.push('isActive')
  }

  // Se nada mudou além do updatedAt, ainda fazemos o UPDATE (idempotente e auditável)
  await tx
    .update(channelAccount)
    .set(updatePayload)
    .where(eq(channelAccount.id, id))

  // -------------------------------------------------------------------------
  // audit_log — registra chaves alteradas, nunca valores de credentials
  // ADR-15: mutação antes do audit
  // -------------------------------------------------------------------------
  await logAudit(tx, {
    actorUserId,
    actionKind: 'update',
    resourceKind: 'channel_account',
    resourceId: id,
    after: {
      changedKeys,
      // ADR-18: nunca logar credentials plaintext
    },
  })
}

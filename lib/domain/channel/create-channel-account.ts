/**
 * MOD-CHANNEL — createChannelAccount
 *
 * T-15-03
 * ADR-10: retorna Promise<{ id: string }> e lança ChannelDomainError
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado)
 * ADR-18: credentials encriptados antes de INSERT via encryptCredentials
 *
 * Zero I/O direto: consome tx para DB e encryptCredentials para pgcrypto.
 */
import { and, eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { brand } from '@/lib/db/schema/organization'
import { channel, channelAccount } from '@/lib/db/schema/conversation'
import { logAudit } from '@/lib/audit/log'
import type { EncryptFn } from './types'
import {
  BrandNotFoundError,
  DuplicateChannelAccountError,
  InvalidChannelKindError,
} from './errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valores válidos do enum channel_kind (docs/30-contracts/01-enums.md). */
export type ChannelKind = 'whatsapp' | 'instagram' | 'email'

const VALID_CHANNEL_KINDS: ReadonlySet<string> = new Set<ChannelKind>([
  'whatsapp',
  'instagram',
  'email',
])

export type CreateChannelAccountInput = {
  brandId: string
  channelKind: string
  externalId: string
  credentials: Record<string, unknown>
  actorUserId: string
}

export type CreateChannelAccountResult = {
  id: string
}

// ---------------------------------------------------------------------------
// createChannelAccount
// ---------------------------------------------------------------------------

/**
 * Cria um novo channel_account vinculado a uma marca, encriptando as credenciais.
 *
 * Passos:
 * 1. Valida channelKind contra enum channel_kind
 * 2. Verifica que brandId existe
 * 3. Verifica unicidade (brandId, channelKind, externalId) — INV-INBOX
 * 4. Encripta credentials via encryptFn (ADR-18)
 * 5. INSERT em channel_account
 * 6. logAudit (action='channel.create')
 *
 * @param tx          Transação DB ativa (ADR-11)
 * @param params      Dados do canal a criar
 * @param encryptFn   Função de encriptação (padrão: encryptCredentials de crypto.ts)
 * @returns           { id } do channel_account criado
 * @throws            InvalidChannelKindError se channelKind inválido
 * @throws            BrandNotFoundError se brandId não existe
 * @throws            DuplicateChannelAccountError se par (brandId, channelKind, externalId) já existe
 */
export async function createChannelAccount(
  tx: DbTx,
  params: CreateChannelAccountInput,
  encryptFn: EncryptFn,
): Promise<CreateChannelAccountResult> {
  const { brandId, channelKind, externalId, credentials, actorUserId } = params

  // -------------------------------------------------------------------------
  // Passo 1: valida channelKind
  // docs/30-contracts/01-enums.md — channel_kind: whatsapp | instagram | email
  // -------------------------------------------------------------------------
  if (!VALID_CHANNEL_KINDS.has(channelKind)) {
    throw new InvalidChannelKindError(channelKind)
  }

  // -------------------------------------------------------------------------
  // Passo 2: verifica que brandId existe
  // -------------------------------------------------------------------------
  const brandRows = await tx
    .select({ id: brand.id })
    .from(brand)
    .where(eq(brand.id, brandId))
    .limit(1)

  if (!brandRows[0]) {
    throw new BrandNotFoundError(brandId)
  }

  // -------------------------------------------------------------------------
  // Passo 3: busca channel row pelo kind e verifica unicidade
  // INV-INBOX: par (canal, marca, external_id) é único
  // -------------------------------------------------------------------------
  const channelRows = await tx
    .select({ id: channel.id })
    .from(channel)
    .where(eq(channel.kind, channelKind as ChannelKind))
    .limit(1)

  const channelRow = channelRows[0]

  if (channelRow) {
    // INV-INBOX: verificar duplicata antes de INSERT para dar erro explícito
    const existingRows = await tx
      .select({ id: channelAccount.id })
      .from(channelAccount)
      .where(
        and(
          eq(channelAccount.channelId, channelRow.id),
          eq(channelAccount.brandId, brandId),
          eq(channelAccount.externalId, externalId),
        ),
      )
      .limit(1)

    if (existingRows[0]) {
      throw new DuplicateChannelAccountError(brandId, channelKind, externalId)
    }
  }

  // -------------------------------------------------------------------------
  // Passo 4: encripta credentials (ADR-18)
  // -------------------------------------------------------------------------
  const envelope = await encryptFn(credentials)

  // -------------------------------------------------------------------------
  // Passo 5: INSERT em channel_account
  // T-15-04 adiciona colunas encryptedAt e lastSeenAt; por ora usamos campos
  // existentes. credentials recebe o envelope serializado como jsonb.
  // -------------------------------------------------------------------------
  if (!channelRow) {
    // channel seed obrigatório — cada kind deve ter um registro na tabela channel
    throw new Error(`channel row for kind=${channelKind} not found — seed required`)
  }

  const insertRows = await tx
    .insert(channelAccount)
    .values({
      channelId: channelRow.id,
      brandId,
      externalId,
      // ADR-18: credentials armazenadas como envelope encriptado em jsonb
      credentials: envelope as Record<string, unknown>,
    })
    .returning({ id: channelAccount.id })

  const inserted = insertRows[0]
  if (!inserted) {
    throw new Error('createChannelAccount: INSERT returned no rows')
  }

  // -------------------------------------------------------------------------
  // Passo 6: audit_log
  // ADR-15: mutação antes do audit
  // -------------------------------------------------------------------------
  await logAudit(tx, {
    actorUserId,
    actionKind: 'create',
    resourceKind: 'channel_account',
    resourceId: inserted.id,
    after: {
      brandId,
      channelKind,
      externalId,
      // ADR-18: nunca logar credentials plaintext
    },
  })

  return { id: inserted.id }
}

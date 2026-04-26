'use server'

/**
 * MOD-CHANNEL / T-15-05 — Server Actions para /settings/integrations/[provider]
 *
 * Contrato: docs/30-contracts/05-api-server-actions.md
 * RBAC: integration.configure (admin + 2FA) — BR-RBAC
 * ADR-10: retorno ActionResult<T> via toActionResult
 * ADR-11: transação SQL única por action
 * ADR-18: credentials encriptadas antes de persistir; plaintext nunca em listagem
 *
 * Escopo: apenas providers kind='channel' (whatsapp_official, instagram).
 * Webhook providers (digital_guru, notazz) ficam read-only — migração em Sprint 16+.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db/client'
import { toActionResult } from '@/lib/actions/result'
import type { ActionResult } from '@/lib/actions/result'
import {
  createChannelAccount,
  updateChannelAccount,
  ChannelAccountNotFoundError,
  DuplicateChannelAccountError,
  BrandNotFoundError,
  InvalidChannelKindError,
} from '@/lib/domain/channel'
import { encryptCredentials } from '@/lib/db/crypto'
import { ActionError } from '@/lib/actions/result'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createChannelAccountSchema = z.object({
  brandId: z.string().uuid(),
  channelKind: z.enum(['whatsapp', 'instagram', 'email']),
  externalId: z.string().min(1, 'ID externo é obrigatório').max(200),
  /** Mapa de credenciais em texto plano — encriptado antes de persistir (ADR-18). */
  credentials: z.record(z.string()),
})

const updateChannelAccountSchema = z.object({
  id: z.string().uuid(),
  /** Novas credenciais, se o usuário quiser rotacionar o token. */
  credentials: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
})

const testConnectionSchema = z.object({
  id: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// createChannelAccountAction
// Guard: integration.configure (admin + 2FA)
// ---------------------------------------------------------------------------

export async function createChannelAccountAction(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'integration.configure', { kind: 'global' })

    const input = createChannelAccountSchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      try {
        return await createChannelAccount(
          tx,
          {
            brandId: input.brandId,
            channelKind: input.channelKind,
            externalId: input.externalId,
            credentials: input.credentials,
            actorUserId: ctx.user.id,
          },
          encryptCredentials,
        )
      } catch (err) {
        if (err instanceof InvalidChannelKindError) {
          throw new ActionError('VALIDATION', err.message)
        }
        if (err instanceof BrandNotFoundError) {
          throw new ActionError('NOT_FOUND', err.message)
        }
        if (err instanceof DuplicateChannelAccountError) {
          throw new ActionError(
            'VALIDATION',
            `Já existe uma conta para esta marca com o mesmo tipo de canal e ID externo.`,
          )
        }
        throw err
      }
    })

    revalidatePath('/settings/integrations')
    revalidatePath(`/settings/integrations/${input.channelKind === 'whatsapp' ? 'whatsapp_official' : input.channelKind}`)

    return result
  })
}

// ---------------------------------------------------------------------------
// updateChannelAccountAction
// Guard: integration.configure (admin + 2FA)
// ---------------------------------------------------------------------------

export async function updateChannelAccountAction(
  rawInput: unknown,
): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'integration.configure', { kind: 'global' })

    const input = updateChannelAccountSchema.parse(rawInput)

    await db.transaction(async (tx) => {
      try {
        const updateParams: {
          id: string
          actorUserId: string
          credentials?: Record<string, unknown>
          isActive?: boolean
        } = {
          id: input.id,
          actorUserId: ctx.user.id,
        }
        if (input.credentials !== undefined) {
          updateParams.credentials = input.credentials
        }
        if (input.isActive !== undefined) {
          updateParams.isActive = input.isActive
        }
        await updateChannelAccount(
          tx,
          updateParams,
          encryptCredentials,
        )
      } catch (err) {
        if (err instanceof ChannelAccountNotFoundError) {
          throw new ActionError('NOT_FOUND', err.message)
        }
        throw err
      }
    })

    revalidatePath('/settings/integrations')
    // Revalida todas as páginas de provider — não sabemos o provider sem busca
    revalidatePath('/settings/integrations/[provider]', 'page')
  })
}

// ---------------------------------------------------------------------------
// testConnectionAction
// Guard: integration.configure (admin + 2FA)
// Phase 1: mock — retorna placeholder OK. Integração real em Sprint 16+.
// ---------------------------------------------------------------------------

export async function testConnectionAction(
  rawInput: unknown,
): Promise<ActionResult<{ ok: boolean; message: string }>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'integration.configure', { kind: 'global' })

    const { id } = testConnectionSchema.parse(rawInput)

    // Phase 1 placeholder — integração real com o provedor fica Sprint 16+
    // O id é validado pelo Zod UUID acima; não buscamos no DB neste phase.
    void id

    return {
      ok: true,
      message: 'Teste de conectividade (placeholder). Integração real disponível no Sprint 16.',
    }
  })
}

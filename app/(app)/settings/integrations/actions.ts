'use server'

/**
 * MOD-SETTINGS / T-12-23 — Server Actions para /settings/integrations
 *
 * Spec: docs/70-ux/02-information-architecture.md §/settings/integrations
 * Contrato: docs/30-contracts/05-api-server-actions.md
 * RBAC: integration.configure (admin + 2FA)
 */

import { z } from 'zod'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { toActionResult } from '@/lib/actions/result'
import type { ActionResult } from '@/lib/actions/result'
import { INTEGRATION_PROVIDERS } from './constants'

// ---------------------------------------------------------------------------
// testIntegrationAction — verifica env vars do provedor (sem request externo)
// Guard: integration.configure (admin + 2FA) — BR-RBAC
// ---------------------------------------------------------------------------

const testIntegrationSchema = z.object({
  provider: z.enum([
    'digital_guru',
    'brevo',
    'whatsapp_official',
    'instagram',
    'notazz',
  ]),
})

export async function testIntegrationAction(
  rawInput: unknown,
): Promise<ActionResult<{ ok: boolean; message: string }>> {
  return toActionResult(async () => {
    const ctx = await requireSession()

    // BR-RBAC: somente admin com 2FA pode configurar integrações
    await requirePermission(ctx, 'integration.configure', { kind: 'global' })

    const { provider } = testIntegrationSchema.parse(rawInput)

    const providerDef = INTEGRATION_PROVIDERS.find((p) => p.provider === provider)
    if (!providerDef) {
      return { ok: false, message: 'Provedor desconhecido.' }
    }

    const missing = providerDef.envVarKeys.filter(
      (key) => !process.env[key],
    )

    if (missing.length > 0) {
      return {
        ok: false,
        message: `Variáveis ausentes: ${missing.join(', ')}`,
      }
    }

    return {
      ok: true,
      message: `${providerDef.displayName}: todas as variáveis de ambiente estão configuradas.`,
    }
  })
}

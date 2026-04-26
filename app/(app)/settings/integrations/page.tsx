/**
 * MOD-SETTINGS / T-12-23 + T-15-05 — /settings/integrations
 *
 * Server Component: lista status de cada provedor de integração.
 * Verifica env vars + busca erros recentes no webhook_log.
 *
 * T-15-05: cada card clicável navega para /settings/integrations/[provider].
 * Cards kind='placeholder' não têm link.
 *
 * Spec: docs/70-ux/02-information-architecture.md §/settings/integrations
 */
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { eq, and, desc } from 'drizzle-orm'
import { IntegrationCard } from '@/components/settings/integration-card'
import { INTEGRATION_PROVIDERS } from './constants'
import type { ProviderKey } from './constants'

export const metadata = {
  title: 'Integrações — Configurações',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mascara o valor da env var, exibindo apenas os últimos 4 chars. */
function maskEnvValue(value: string | undefined): string | null {
  if (!value) return null
  if (value.length <= 4) return '****'
  return `****${value.slice(-4)}`
}

/** Determina status do provedor com base na presença de env vars. */
function resolveProviderStatus(
  envVarKeys: readonly string[],
  hasRecentErrors: boolean,
): 'configured' | 'missing' | 'error' {
  const allPresent = envVarKeys.every((key) => !!process.env[key])
  if (!allPresent) return 'missing'
  if (hasRecentErrors) return 'error'
  return 'configured'
}

// Tipo real do provider do enum Drizzle
type DbProvider =
  | 'digital_guru'
  | 'brevo'
  | 'whatsapp_official'
  | 'instagram'
  | 'email'
  | 'notazz'
  | 'analytics'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function IntegrationsPage() {
  // Buscar até 3 erros recentes por provedor em uma única query por provedor
  // (N queries pequenas — 5 provedores, aceitável para Server Component)
  const PROVIDERS_TO_SHOW = INTEGRATION_PROVIDERS.map((p) => p.provider as DbProvider)

  const recentErrorsByProvider = await Promise.all(
    PROVIDERS_TO_SHOW.map(async (provider) => {
      const rows = await db
        .select({
          eventKind: webhookLog.eventKind,
          receivedAt: webhookLog.receivedAt,
        })
        .from(webhookLog)
        .where(
          and(
            eq(webhookLog.provider, provider),
            eq(webhookLog.status, 'failed'),
          ),
        )
        .orderBy(desc(webhookLog.receivedAt))
        .limit(3)

      return { provider, errors: rows }
    }),
  )

  const errorsMap = Object.fromEntries(
    recentErrorsByProvider.map(({ provider, errors }) => [provider, errors]),
  ) as Record<
    DbProvider,
    { eventKind: string | null; receivedAt: Date }[]
  >

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status e configuração dos provedores externos conectados ao CNE-OS.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {INTEGRATION_PROVIDERS.map((def) => {
          const providerErrors = errorsMap[def.provider as DbProvider] ?? []
          const hasRecentErrors = providerErrors.length > 0
          const status = resolveProviderStatus(def.envVarKeys, hasRecentErrors)

          const envVars = def.envVarKeys.map((key) => ({
            key,
            maskedValue: maskEnvValue(process.env[key]),
          }))

          const recentErrors = providerErrors.map((e) => ({
            event: e.eventKind ?? '(evento desconhecido)',
            createdAt: e.receivedAt.toISOString(),
          }))

          return (
            <IntegrationCard
              key={def.provider}
              provider={def.provider as ProviderKey}
              displayName={def.displayName}
              kind={def.kind}
              status={status}
              envVars={envVars}
              recentErrors={recentErrors}
            />
          )
        })}
      </div>
    </div>
  )
}

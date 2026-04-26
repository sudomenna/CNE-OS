'use client'

/**
 * MOD-SETTINGS / T-12-23 — IntegrationCard
 *
 * Client Component: exibe status, env vars mascaradas e erros recentes
 * de um provedor de integração. Permite testar a conexão via Server Action.
 *
 * Spec: docs/70-ux/02-information-architecture.md §/settings/integrations
 * Acessibilidade AA: labels, roles, foco visível.
 */

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { testIntegrationAction } from '@/app/(app)/settings/integrations/actions'
import type { ProviderKey } from '@/app/(app)/settings/integrations/constants'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IntegrationCardProps {
  provider: ProviderKey
  displayName: string
  status: 'configured' | 'missing' | 'error'
  envVars: { key: string; maskedValue: string | null }[]
  recentErrors: { event: string; createdAt: string }[]
}

// ---------------------------------------------------------------------------
// Constantes de label e variante de Badge
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<IntegrationCardProps['status'], string> = {
  configured: 'Configurado',
  missing: 'Não configurado',
  error: 'Erro recente',
}

const STATUS_VARIANT: Record<
  IntegrationCardProps['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  configured: 'default',
  missing: 'secondary',
  error: 'destructive',
}

// ---------------------------------------------------------------------------
// Ícone de inicial
// ---------------------------------------------------------------------------

function ProviderInitial({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <span
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-lg select-none"
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

// ---------------------------------------------------------------------------
// IntegrationCard
// ---------------------------------------------------------------------------

export function IntegrationCard({
  provider,
  displayName,
  status,
  envVars,
  recentErrors,
}: IntegrationCardProps) {
  const [isPending, startTransition] = useTransition()
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  function handleTest() {
    startTransition(async () => {
      setTestResult(null)
      const result = await testIntegrationAction({ provider })

      if (!result.ok) {
        const msg = result.error.message
        setTestResult({ ok: false, message: msg })
        toast.error(`${displayName}: ${msg}`)
        return
      }

      setTestResult(result.data)
      if (result.data.ok) {
        toast.success(result.data.message)
      } else {
        toast.error(result.data.message)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ProviderInitial name={displayName} />
            <div>
              <CardTitle className="text-base leading-tight">
                {displayName}
              </CardTitle>
              <CardDescription className="mt-0.5 capitalize text-xs">
                {provider.replace(/_/g, ' ')}
              </CardDescription>
            </div>
          </div>
          <Badge variant={STATUS_VARIANT[status]} className="shrink-0 mt-1">
            {STATUS_LABEL[status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Env vars mascaradas */}
        <section aria-label={`Variáveis de ambiente de ${displayName}`}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Variáveis de ambiente
          </h3>
          <ul className="space-y-1" role="list">
            {envVars.map(({ key, maskedValue }) => (
              <li key={key} className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-foreground/80 truncate">
                  {key}
                </code>
                <span
                  className={`text-xs font-mono shrink-0 ${
                    maskedValue
                      ? 'text-foreground/60'
                      : 'text-destructive italic'
                  }`}
                  aria-label={
                    maskedValue
                      ? `Valor parcial: ${maskedValue}`
                      : 'Não definida'
                  }
                >
                  {maskedValue ?? '(não definida)'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Erros recentes */}
        {recentErrors.length > 0 && (
          <section aria-label={`Erros recentes de ${displayName}`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Erros recentes
            </h3>
            <ul className="space-y-1" role="list">
              {recentErrors.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground/70 truncate">
                    {e.event}
                  </span>
                  <time
                    dateTime={e.createdAt}
                    className="text-xs text-muted-foreground shrink-0"
                  >
                    {new Date(e.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Resultado inline do teste */}
        {testResult !== null && (
          <p
            role="status"
            className={`text-xs rounded px-2 py-1 ${
              testResult.ok
                ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {testResult.message}
          </p>
        )}

        {/* Botão testar */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleTest}
          disabled={isPending}
          aria-label={`Testar conexão com ${displayName}`}
        >
          {isPending ? 'Testando…' : 'Testar conexão'}
        </Button>
      </CardContent>
    </Card>
  )
}

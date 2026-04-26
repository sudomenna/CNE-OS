'use client'

/**
 * MOD-SETTINGS / T-12-23 + T-15-05 — IntegrationCard
 *
 * Client Component: exibe status, env vars mascaradas e erros recentes
 * de um provedor de integração.
 *
 * T-15-05: Cards com kind='channel' ou kind='webhook' tornam-se links
 * clicáveis para /settings/integrations/[provider]. Cards com
 * kind='placeholder' exibem "Em breve" sem link ativo.
 *
 * Spec: docs/70-ux/02-information-architecture.md §/settings/integrations
 * Acessibilidade AA: labels, roles, foco visível.
 */

import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ProviderKey, ProviderKind } from '@/app/(app)/settings/integrations/constants'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IntegrationCardProps {
  provider: ProviderKey
  displayName: string
  kind: ProviderKind
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
// CardBody — conteúdo interno (sem wrapper de Link)
// ---------------------------------------------------------------------------

function CardBody({
  provider,
  displayName,
  kind,
  status,
  envVars,
  recentErrors,
}: IntegrationCardProps) {
  return (
    <Card className={kind !== 'placeholder' ? 'hover:border-primary/50 transition-colors cursor-pointer' : 'opacity-70'}>
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
          <div className="flex items-center gap-2 shrink-0 mt-1">
            {kind === 'placeholder' && (
              <Badge variant="outline" className="text-xs">Em breve</Badge>
            )}
            <Badge variant={STATUS_VARIANT[status]}>
              {STATUS_LABEL[status]}
            </Badge>
          </div>
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

        {/* Hint de navegação */}
        {kind !== 'placeholder' && (
          <p className="text-xs text-muted-foreground text-right">
            Clique para configurar &rarr;
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// IntegrationCard — com ou sem Link dependendo do kind
// ---------------------------------------------------------------------------

export function IntegrationCard(props: IntegrationCardProps) {
  if (props.kind === 'placeholder') {
    return <CardBody {...props} />
  }

  return (
    <Link
      href={`/settings/integrations/${props.provider}` as Route}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
      aria-label={`Configurar ${props.displayName}`}
    >
      <CardBody {...props} />
    </Link>
  )
}

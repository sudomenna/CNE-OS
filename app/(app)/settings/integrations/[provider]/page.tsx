/**
 * MOD-CHANNEL / T-15-05 — /settings/integrations/[provider]
 *
 * Server Component: página de configuração por provider de integração.
 *
 * kind='channel' (whatsapp_official, instagram):
 *   - Lista channel_accounts existentes (ChannelAccountsList)
 *   - Form para adicionar nova conta (ProviderConfigForm)
 *
 * kind='webhook' (digital_guru, notazz):
 *   - Status read-only (env vars)
 *   - Mensagem explicativa sobre migração para Sprint 16
 *
 * kind='placeholder' (brevo):
 *   - Card "Em breve"
 *
 * ADR-18: listagem via listChannelsByBrand retorna apenas metadados — sem
 * ciphertext nem plaintext.
 *
 * Next.js 15: params é Promise<{ provider: string }> — usar await params.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { brand } from '@/lib/db/schema/organization'
import { isNull } from 'drizzle-orm'
import { listChannelsByBrand } from '@/lib/domain/channel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ChannelAccountsList } from './_components/channel-accounts-list'
import { ProviderConfigForm } from './_components/provider-config-form'
import {
  findProvider,
  INTEGRATION_PROVIDERS,
} from '@/app/(app)/settings/integrations/constants'
import type { CredentialField } from './_components/provider-config-form'

// ---------------------------------------------------------------------------
// Metadata dinâmico
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>
}) {
  const { provider } = await params
  const def = findProvider(provider)
  return {
    title: def
      ? `${def.displayName} — Integrações — Configurações`
      : 'Integração — Configurações',
  }
}

// ---------------------------------------------------------------------------
// generateStaticParams — lista de providers conhecidos
// ---------------------------------------------------------------------------

export function generateStaticParams() {
  return INTEGRATION_PROVIDERS.map((p) => ({ provider: p.provider }))
}

// ---------------------------------------------------------------------------
// Mapeamento de credentialFields por provider
// ---------------------------------------------------------------------------

const CREDENTIAL_FIELDS: Record<string, CredentialField[]> = {
  whatsapp_official: [
    {
      key: 'app_secret',
      label: 'App Secret',
      required: true,
      placeholder: 'App Secret do aplicativo Meta',
    },
    {
      key: 'access_token',
      label: 'Access Token',
      required: true,
      placeholder: 'Token de acesso permanente',
    },
    {
      key: 'phone_number_id',
      label: 'Phone Number ID',
      required: true,
      placeholder: 'ID do número de telefone no WhatsApp Business',
    },
  ],
  instagram: [
    {
      key: 'app_secret',
      label: 'App Secret',
      required: true,
      placeholder: 'App Secret do aplicativo Meta',
    },
    {
      key: 'access_token',
      label: 'Access Token',
      required: true,
      placeholder: 'Token de acesso permanente',
    },
    {
      key: 'account_id',
      label: 'Account ID',
      required: true,
      placeholder: 'ID da conta Instagram conectada',
    },
  ],
}

const EXTERNAL_ID_CONFIG: Record<string, { label: string; placeholder?: string }> = {
  whatsapp_official: {
    label: 'Phone Number ID',
    placeholder: 'Ex: 123456789012345',
  },
  instagram: {
    label: 'Account ID',
    placeholder: 'Ex: 17841400000000000',
  },
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ provider: string }>
}) {
  const { provider } = await params
  const def = findProvider(provider)

  // 404 se provider não existe
  if (!def) {
    notFound()
  }

  // ---------------------------------------------------------------------------
  // kind = 'placeholder' (brevo)
  // ---------------------------------------------------------------------------
  if (def.kind === 'placeholder') {
    return (
      <div className="space-y-6">
        <nav aria-label="Navegação de volta" className="text-sm">
          <Link
            href="/settings/integrations"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Integrações
          </Link>
        </nav>

        <div>
          <h1 className="text-2xl font-bold text-foreground">{def.displayName}</h1>
          <p className="text-sm text-muted-foreground mt-1">{def.description}</p>
        </div>

        <Card>
          <CardContent className="py-8 text-center">
            <Badge variant="outline" className="mb-3">Em breve</Badge>
            <p className="text-muted-foreground text-sm">
              O adapter do Brevo ainda não foi implementado.
              Estará disponível em um sprint futuro.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // kind = 'webhook' (digital_guru, notazz)
  // ---------------------------------------------------------------------------
  if (def.kind === 'webhook') {
    const missingVars = def.envVarKeys.filter((k) => !process.env[k])
    const status = missingVars.length === 0 ? 'configured' : 'missing'

    return (
      <div className="space-y-6">
        <nav aria-label="Navegação de volta" className="text-sm">
          <Link
            href="/settings/integrations"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Integrações
          </Link>
        </nav>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{def.displayName}</h1>
            <p className="text-sm text-muted-foreground mt-1">{def.description}</p>
          </div>
          <Badge variant={status === 'configured' ? 'default' : 'secondary'}>
            {status === 'configured' ? 'Configurado' : 'Não configurado'}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuração via variável de ambiente</CardTitle>
            <CardDescription>
              Este provedor utiliza HMAC secret e credenciais configuradas diretamente
              nas variáveis de ambiente do projeto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2" role="list" aria-label="Variáveis de ambiente">
              {def.envVarKeys.map((key) => {
                const present = !!process.env[key]
                return (
                  <li key={key} className="flex items-center justify-between gap-4">
                    <code className="text-sm font-mono">{key}</code>
                    <Badge variant={present ? 'default' : 'destructive'}>
                      {present ? 'Definida' : 'Ausente'}
                    </Badge>
                  </li>
                )
              })}
            </ul>

            <Separator />

            <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                Migração para credenciais encriptadas no banco
              </p>
              <p>
                A configuração via variável de ambiente é o mecanismo atual para este provedor.
                O Sprint 16 trará migração completa para armazenamento encriptado no banco de dados
                (pgcrypto), permitindo rotação de tokens sem redeploy.
              </p>
              <p>
                Para alterar credenciais agora, atualize as variáveis de ambiente no painel do{' '}
                <span className="font-medium">Vercel</span> e faça um novo deploy.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // kind = 'channel' (whatsapp_official, instagram)
  // ---------------------------------------------------------------------------

  // Busca brands ativas para o select do formulário
  const brands = await db
    .select({ id: brand.id, name: brand.name })
    .from(brand)
    .where(isNull(brand.deletedAt))
    .orderBy(brand.name)

  // Busca channel_accounts de todas as brands para listar
  // (cada brand pode ter múltiplos accounts do mesmo provider)
  const channelAccountsByBrand = await Promise.all(
    brands.map(async (b) => {
      const providerDef = def as { kind: 'channel'; channelKind: 'whatsapp' | 'instagram' | 'email' } & typeof def
      const accounts = await listChannelsByBrand(b.id)
      return accounts.filter((a) => a.channelKind === providerDef.channelKind)
    }),
  )

  // Achata a lista, injetando brandName para exibição
  const allAccounts = channelAccountsByBrand.flat()

  const credentialFields = CREDENTIAL_FIELDS[def.provider] ?? []
  const externalIdConfig = EXTERNAL_ID_CONFIG[def.provider] ?? {
    label: 'ID externo',
    placeholder: undefined,
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Navegação de volta" className="text-sm">
        <Link
          href="/settings/integrations"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Integrações
        </Link>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{def.displayName}</h1>
        <p className="text-sm text-muted-foreground mt-1">{def.description}</p>
      </div>

      {/* Lista de contas ativas */}
      <section aria-labelledby="accounts-title">
        <h2 id="accounts-title" className="text-lg font-semibold mb-3">
          Contas configuradas
        </h2>
        <ChannelAccountsList
          accounts={allAccounts}
          credentialFields={credentialFields}
          providerDisplayName={def.displayName}
        />
      </section>

      <Separator />

      {/* Formulário para adicionar nova conta */}
      <section aria-labelledby="add-account-title">
        <Card>
          <CardHeader>
            <CardTitle id="add-account-title" className="text-base">
              Adicionar nova conta
            </CardTitle>
            <CardDescription>
              Conecte uma nova instância de {def.displayName} a uma das suas marcas.
              Os tokens são armazenados encriptados (ADR-18) — nunca ficam em texto plano.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {brands.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma marca cadastrada. Crie uma marca primeiro em{' '}
                <Link href="/settings/brands" className="underline">
                  Configurações &gt; Marcas
                </Link>
                .
              </p>
            ) : (
              <ProviderConfigForm
                channelKind={(def as { channelKind: 'whatsapp' | 'instagram' | 'email' }).channelKind}
                credentialFields={credentialFields}
                brands={brands}
                externalIdLabel={externalIdConfig.label}
                externalIdPlaceholder={externalIdConfig.placeholder}
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

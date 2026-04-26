'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

// Mapa canônico de segmentos de URL → labels em pt-BR
const SEGMENT_LABELS: Record<string, string> = {
  contacts: 'Contatos',
  inbox: 'Inbox',
  funnels: 'Funis',
  offers: 'Ofertas',
  transactions: 'Transações',
  tickets: 'Tickets',
  analytics: 'Analytics',
  automations: 'Automações',
  billing: 'Cobrança',
  settings: 'Configurações',
  brands: 'Marcas',
  users: 'Usuários',
  catalog: 'Catálogo',
  products: 'Produtos',
  categories: 'Categorias',
  benefits: 'Benefícios',
  integrations: 'Integrações',
  audit: 'Auditoria',
  account: 'Minha Conta',
  webhooks: 'Webhooks',
  'legal-entities': 'CNPJ',
  new: 'Novo',
  edit: 'Editar',
  sales: 'Vendas',
  atendimento: 'Atendimento',
  campaigns: 'Campanhas',
  refunds: 'Reembolsos',
  overview: 'Visão Geral',
  subscriptions: 'Assinaturas',
  delinquency: 'Inadimplência',
}

// UUID v4/v7: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars, hex + dashes)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// IDs curtos alfanuméricos comuns (cuid, nanoid, etc.) — 20–30 chars, alfanum sem traços
const SHORT_ID_PATTERN = /^[0-9a-z]{20,}$/i

function isId(segment: string): boolean {
  return UUID_PATTERN.test(segment) || SHORT_ID_PATTERN.test(segment)
}

function segmentToLabel(segment: string, override?: string): string {
  if (override) return override
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment]
  if (isId(segment)) return '#' + segment.slice(0, 8)
  // Humanize unknown segments: replace dashes/underscores with spaces, capitalize first letter
  return segment.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export interface BreadcrumbsProps {
  overrides?: Record<string, string> // segmento → label customizado
}

export function Breadcrumbs({ overrides }: BreadcrumbsProps) {
  const pathname = usePathname()

  // Split and filter empty strings (leading slash produces one)
  const segments = pathname.split('/').filter(Boolean)

  // Do not render on root or single-segment paths
  if (segments.length <= 1) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1
          const href = '/' + segments.slice(0, index + 1).join('/')
          const label = segmentToLabel(segment, overrides?.[segment])

          return (
            <BreadcrumbItem key={href}>
              {isLast ? (
                <BreadcrumbPage className="font-medium text-foreground">
                  {label}
                </BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink asChild>
                    <Link href={href as Route}>{label}</Link>
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

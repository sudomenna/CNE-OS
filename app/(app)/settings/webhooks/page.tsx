/**
 * MOD-INTEGRATIONS / T-8-17 — /settings/webhooks (lista)
 *
 * Server Component: filtra por status e provider via searchParams.
 * Destaque visual para entradas dead_letter (cor de alerta).
 *
 * FLOW-12 — Reprocessamento manual de webhook DLQ
 * T-16-12 — Customização de colunas via <WebhooksList>
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { WebhooksList, type WebhookRow } from '@/components/settings/webhooks-list'
import { getWebhookLogs } from './actions'

export const metadata = {
  title: 'Webhooks — Configurações',
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'failed', label: 'Falhou' },
  { value: 'dead_letter', label: 'DLQ (Dead Letter)' },
  { value: 'received', label: 'Recebido' },
  { value: 'processed', label: 'Processado' },
]

const PROVIDER_OPTIONS = [
  { value: '', label: 'Todos os provedores' },
  { value: 'digital_guru', label: 'Digital Guru' },
  { value: 'brevo', label: 'Brevo' },
  { value: 'whatsapp_official', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'email', label: 'E-mail' },
  { value: 'notazz', label: 'Notazz' },
  { value: 'analytics', label: 'Analytics' },
]

// ---------------------------------------------------------------------------
// Props de searchParams (Next.js App Router)
// ---------------------------------------------------------------------------

type SearchParams = {
  status?: string
  provider?: string
  page?: string
}

type PageProps = {
  searchParams: Promise<SearchParams>
}

// ---------------------------------------------------------------------------
// Componente da página
// ---------------------------------------------------------------------------

export default async function WebhooksPage({ searchParams }: PageProps) {
  // Obter userId para o customizador de colunas (localStorage namespace)
  let ctx
  try {
    ctx = await requireSession()
  } catch {
    redirect('/login')
  }

  const params = await searchParams
  const statusFilter = params.status ?? ''
  const providerFilter = params.provider ?? ''
  const page = Number(params.page ?? '1')

  const result = await getWebhookLogs({
    status: statusFilter || undefined,
    provider: providerFilter || undefined,
    page,
    pageSize: 50,
  })

  const data = result.ok ? result.data : null
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 50
  const totalPages = Math.ceil(total / pageSize)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    const merged = {
      status: statusFilter,
      provider: providerFilter,
      page: String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v)
    }
    return `/settings/webhooks?${p.toString()}`
  }

  // Mapear para WebhookRow com receivedAt como string ISO
  const rows: WebhookRow[] = items.map((item) => ({
    id: item.id,
    provider: item.provider,
    eventKind: item.eventKind ?? null,
    status: item.status,
    attempts: item.attempts,
    receivedAt:
      typeof item.receivedAt === 'string'
        ? item.receivedAt
        : (item.receivedAt as Date).toISOString(),
  }))

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Webhooks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitore e reprocesse eventos de integrações externas. Entradas{' '}
          <span className="font-medium text-red-600">DLQ</span> exigem atenção imediata.
        </p>
      </div>

      {/* Filtros */}
      <form method="GET" action="/settings/webhooks" className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <label htmlFor="filter-status" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Status
          </label>
          <select
            id="filter-status"
            name="status"
            defaultValue={statusFilter}
            className="flex h-9 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="filter-provider" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Provedor
          </label>
          <select
            id="filter-provider"
            name="provider"
            defaultValue={providerFilter}
            className="flex h-9 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
          >
            Filtrar
          </button>
        </div>
        {(statusFilter || providerFilter) && (
          <div className="flex items-end">
            <Link
              href="/settings/webhooks"
              className="h-9 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 inline-flex items-center transition-colors"
            >
              Limpar filtros
            </Link>
          </div>
        )}
      </form>

      {/* Totalizador */}
      <p className="text-sm text-muted-foreground">
        {total === 0
          ? 'Nenhum evento encontrado.'
          : `${total} evento${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
      </p>

      {/* Erro ao carregar */}
      {!result.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar os webhooks. Tente recarregar a página.
        </div>
      )}

      {/* Tabela com customizador de colunas */}
      <WebhooksList
        rows={rows}
        userId={ctx.user.id}
        statusFilter={statusFilter}
        providerFilter={providerFilter}
      />

      {/* Paginação */}
      {totalPages > 1 && (
        <nav
          aria-label="Paginação"
          className="flex items-center justify-between text-sm text-muted-foreground"
        >
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                href={buildUrl({ page: String(page - 1) }) as any}
                className="rounded border border-border px-3 py-1.5 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                href={buildUrl({ page: String(page + 1) }) as any}
                className="rounded border border-border px-3 py-1.5 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                Próxima
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}

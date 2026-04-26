'use client'

/**
 * WebhooksList — client component que renderiza a tabela de webhooks
 * com suporte a customização de colunas via <ColumnsCustomizer>.
 *
 * Extraído de app/(app)/settings/webhooks/page.tsx (T-16-12).
 */

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import {
  WEBHOOKS_COLUMNS,
  SETTINGS_WEBHOOKS_TABLE_ID,
} from './webhooks-columns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookRow = {
  id: string
  provider: string
  eventKind: string | null
  status: string
  attempts: number
  receivedAt: string // ISO string
}

export interface WebhooksListProps {
  rows: WebhookRow[]
  userId: string
  statusFilter?: string
  providerFilter?: string
}

// ---------------------------------------------------------------------------
// Labels e estilos de status (copiados do page.tsx para manter consistência)
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  received: 'Recebido',
  processed: 'Processado',
  failed: 'Falhou',
  dead_letter: 'DLQ',
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  received: 'secondary',
  processed: 'default',
  failed: 'destructive',
  dead_letter: 'destructive',
}

const PROVIDER_LABELS: Record<string, string> = {
  digital_guru: 'Digital Guru',
  brevo: 'Brevo',
  whatsapp_official: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  notazz: 'Notazz',
  analytics: 'Analytics',
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function WebhooksList({
  rows,
  userId,
  statusFilter,
  providerFilter,
}: WebhooksListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: SETTINGS_WEBHOOKS_TABLE_ID,
    userId,
    columns: WEBHOOKS_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={SETTINGS_WEBHOOKS_TABLE_ID}
          userId={userId}
          columns={WEBHOOKS_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de webhooks">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {/* provider — alwaysVisible */}
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Provedor
              </th>
              {isVisible('eventKind') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Tipo de evento
                </th>
              )}
              {isVisible('status') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
              )}
              {isVisible('attempts') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Tentativas
                </th>
              )}
              {isVisible('receivedAt') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Recebido em
                </th>
              )}
              {/* actions — alwaysVisible */}
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIds.size}
                  className="px-4 py-8 text-center text-muted-foreground/60"
                >
                  Nenhum evento encontrado
                  {statusFilter || providerFilter ? ' com os filtros aplicados' : ''}.
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const isAlert = item.status === 'dead_letter' || item.status === 'failed'
                return (
                  <tr
                    key={item.id}
                    className={[
                      'border-b border-border last:border-0 transition-colors',
                      isAlert ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-muted/50',
                    ].join(' ')}
                  >
                    {/* provider — alwaysVisible */}
                    <td className="px-4 py-3">
                      <span className={`font-medium ${isAlert ? 'text-red-700' : 'text-foreground'}`}>
                        {PROVIDER_LABELS[item.provider] ?? item.provider}
                      </span>
                    </td>
                    {isVisible('eventKind') && (
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.eventKind ?? (
                          <span className="text-muted-foreground/40 italic">—</span>
                        )}
                      </td>
                    )}
                    {isVisible('status') && (
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[item.status] ?? 'outline'}>
                          {STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                      </td>
                    )}
                    {isVisible('attempts') && (
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {item.attempts}
                      </td>
                    )}
                    {isVisible('receivedAt') && (
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(item.receivedAt).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                    )}
                    {/* actions — alwaysVisible */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/settings/webhooks/${item.id}`}
                        className="text-sm font-medium text-muted-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
                        aria-label={`Ver detalhes do webhook ${item.id}`}
                      >
                        Detalhes
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

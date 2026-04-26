'use client'

/**
 * TransactionActionsMenu — Client Component
 * T-12-31: Menu dropdown de ações no header da página de detalhe de transação.
 *
 * Ações:
 *   - Reemitir NF-e   → reemitirNfeAction (notazz/invoice.requested)
 *   - Cancelar NF-e   → cancelarNfeAction  (notazz/invoice.cancel)
 *   - Reprocessar webhook → reprocessarWebhookAction
 *
 * Exibe toast de feedback após cada ação.
 * Ownership: components/transaction/transaction-actions-menu.tsx
 */

import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { reemitirNfeAction, cancelarNfeAction, reprocessarWebhookAction } from '@/app/(app)/transactions/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransactionActionsMenuProps {
  transactionId: string
  /** Se false, não exibe a opção de reprocessar webhook (OQ-TD-03) */
  hasWebhook: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionActionsMenu({
  transactionId,
  hasWebhook,
}: TransactionActionsMenuProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null)

  async function handleAction(
    label: string,
    fn: (input: unknown) => Promise<{ ok: boolean; error?: { message: string } }>,
  ) {
    setLoading(label)
    setFeedback(null)
    try {
      const result = await fn({ transactionId })
      if (result.ok) {
        setFeedback({ message: `${label}: solicitado com sucesso.`, ok: true })
      } else {
        setFeedback({
          message: result.error?.message ?? `Erro ao executar ${label}.`,
          ok: false,
        })
      }
    } catch {
      setFeedback({ message: `Erro inesperado ao executar ${label}.`, ok: false })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Feedback inline */}
      {feedback && (
        <p
          role="alert"
          aria-live="polite"
          className={`text-xs ${feedback.ok ? 'text-emerald-600' : 'text-destructive'}`}
        >
          {feedback.message}
        </p>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={loading !== null}
          aria-label="Abrir menu de acoes da transacao"
        >
          NF-e
          {/* Chevron */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Acoes de NF-e</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => handleAction('Reemitir NF-e', reemitirNfeAction)}
            disabled={loading !== null}
            aria-label="Reemitir NF-e desta transacao"
          >
            {loading === 'Reemitir NF-e' ? 'Solicitando...' : 'Reemitir NF-e'}
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => handleAction('Cancelar NF-e', cancelarNfeAction)}
            disabled={loading !== null}
            className="text-destructive focus:text-destructive"
            aria-label="Cancelar NF-e desta transacao"
          >
            {loading === 'Cancelar NF-e' ? 'Cancelando...' : 'Cancelar NF-e'}
          </DropdownMenuItem>

          {hasWebhook && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Webhook</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() =>
                  handleAction('Reprocessar webhook', reprocessarWebhookAction)
                }
                disabled={loading !== null}
                aria-label="Reprocessar webhook de origem desta transacao"
              >
                {loading === 'Reprocessar webhook'
                  ? 'Enviando...'
                  : 'Reprocessar webhook'}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

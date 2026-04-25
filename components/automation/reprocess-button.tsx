'use client'

/**
 * ReprocessButton — botão que reenfileira uma execução com status='failed'.
 * Client Component (interatividade: loading state).
 * T-11-12: docs/20-domain/15-automation.md §12 FLOW-AUTOMATION-REPROCESS
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reprocessExecution } from '@/app/(app)/automations/actions'

interface Props {
  executionId: string
  flowId: string
}

export function ReprocessButton({ executionId, flowId }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleReprocess() {
    startTransition(async () => {
      const result = await reprocessExecution({ executionId })
      if (result.ok) {
        router.push(`/automations/${flowId}/executions`)
        router.refresh()
      } else {
        // Surfaça o erro de forma acessível (alert temporário)
        alert(`Erro ao reenfileirar: ${result.error.message}`)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleReprocess}
      disabled={isPending}
      aria-label="Reenfileirar execução"
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition-colors whitespace-nowrap"
    >
      {isPending ? (
        <>
          <svg
            className="h-3.5 w-3.5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Reenfileirando...
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clipRule="evenodd"
            />
          </svg>
          Reenfileirar
        </>
      )}
    </button>
  )
}

'use client'

/**
 * MOD-INTEGRATIONS / FLOW-12 §3 — Formulário de adição de nota de operador
 *
 * Client Component: textarea inline + botão para submeter nota.
 * Chama addOperatorNoteAction(id, note) sem alterar status.
 *
 * FLOW-12 §3: operador identifica causa, registra nota em operator_notes (append-only).
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { addOperatorNoteAction } from '@/app/(app)/settings/webhooks/actions'

type AddOperatorNoteFormProps = {
  webhookLogId: string
}

export function AddOperatorNoteForm({ webhookLogId }: AddOperatorNoteFormProps) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!note.trim()) {
      setError('Nota não pode estar vazia.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)

    const result = await addOperatorNoteAction(webhookLogId, note.trim())

    if (!result.ok) {
      if (result.error.code === 'UNAUTHORIZED') {
        setError('Sem permissão para adicionar nota.')
      } else if (result.error.code === 'NOT_FOUND') {
        setError('Webhook não encontrado.')
      } else {
        setError('Erro ao salvar nota. Tente novamente.')
      }
      setLoading(false)
      return
    }

    setSuccess(true)
    setNote('')

    // Limpar feedback após 3s
    setTimeout(() => setSuccess(false), 3000)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="Adicionar nota de operador">
      <div className="space-y-2">
        <label
          htmlFor="operator-note"
          className="text-sm font-medium text-foreground"
        >
          Nova nota
        </label>
        <Textarea
          id="operator-note"
          placeholder="Descreva a causa identificada, ação tomada ou observação relevante..."
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
            if (error) setError(null)
          }}
          rows={3}
          maxLength={1000}
          aria-required="true"
          aria-describedby={
            error ? 'operator-note-error' : success ? 'operator-note-success' : undefined
          }
          className="resize-none"
          disabled={loading}
        />
        <div className="flex items-center justify-between">
          <div>
            {error && (
              <p
                id="operator-note-error"
                role="alert"
                className="text-sm text-red-600"
              >
                {error}
              </p>
            )}
            {success && (
              <p
                id="operator-note-success"
                role="status"
                className="text-sm text-green-600"
              >
                Nota adicionada com sucesso.
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{note.length}/1000</p>
        </div>
      </div>

      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={loading || note.trim().length === 0}
        aria-busy={loading}
      >
        {loading ? 'Salvando...' : 'Adicionar nota'}
      </Button>
    </form>
  )
}

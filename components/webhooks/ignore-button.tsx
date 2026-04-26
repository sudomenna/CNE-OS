'use client'

/**
 * MOD-INTEGRATIONS / FLOW-12 §7 — Botão "Ignorar" para webhook DLQ
 *
 * Client Component: abre Dialog com Textarea para nota obrigatória antes
 * de confirmar a ação de ignore. Chama ignoreWebhookAction(id, note).
 *
 * Visível APENAS para status 'failed'|'dead_letter' com papel admin|financial.
 * FLOW-12 §4 — ação 'ignore': marca como processed sem efeito de domínio.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ignoreWebhookAction } from '@/app/(app)/settings/webhooks/actions'

type IgnoreButtonProps = {
  webhookLogId: string
  status: string
  canReprocess: boolean
}

export function IgnoreButton({ webhookLogId, status, canReprocess }: IgnoreButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // FLOW-12: botão só disponível para status failed ou dead_letter + RBAC OK
  const isIgnorable = status === 'failed' || status === 'dead_letter'
  if (!isIgnorable || !canReprocess) return null

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      // Limpar estado ao fechar
      setNote('')
      setError(null)
    }
    setOpen(isOpen)
  }

  async function handleConfirm() {
    if (!note.trim()) {
      setError('A nota é obrigatória para ignorar um webhook.')
      return
    }

    setLoading(true)
    setError(null)

    const result = await ignoreWebhookAction(webhookLogId, note.trim())

    if (!result.ok) {
      if (result.error.code === 'UNAUTHORIZED') {
        setError('Sem permissão para ignorar. Verifique seu papel e 2FA.')
      } else if (result.error.code === 'CONFLICT') {
        setError('Este webhook não pode ser ignorado no estado atual.')
      } else if (result.error.code === 'VALIDATION_FAILED') {
        setError(result.error.message ?? 'Dados inválidos. Tente novamente.')
      } else {
        setError('Erro ao ignorar webhook. Tente novamente.')
      }
      setLoading(false)
      return
    }

    setSuccess(true)
    setOpen(false)

    // Redireciona para lista com feedback visual após breve pausa
    setTimeout(() => {
      router.push('/settings/webhooks')
    }, 800)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Ignorar este webhook sem processar"
          disabled={success}
        >
          {success ? 'Ignorado!' : 'Ignorar'}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ignorar webhook</DialogTitle>
          <DialogDescription>
            O evento será marcado como processado sem gerar nenhum efeito de
            domínio (ex.: venda, entitlement). Esta ação é irreversível. Registre
            o motivo para fins de auditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label
            htmlFor="ignore-note"
            className="text-sm font-medium text-foreground"
          >
            Motivo / observação <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <Textarea
            id="ignore-note"
            placeholder="Ex.: Evento duplicata reconhecida, oferta arquivada há 6 meses..."
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              if (error) setError(null)
            }}
            rows={4}
            maxLength={1000}
            aria-required="true"
            aria-describedby={error ? 'ignore-note-error' : undefined}
            className="resize-none"
            disabled={loading}
          />
          {error && (
            <p
              id="ignore-note-error"
              role="alert"
              className="text-sm text-red-600"
            >
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground text-right">
            {note.length}/1000
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || note.trim().length === 0}
            aria-busy={loading}
          >
            {loading ? 'Ignorando...' : 'Confirmar ignore'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

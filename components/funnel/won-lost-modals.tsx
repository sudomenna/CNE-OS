'use client'

/**
 * WonModal / LostModal — Diálogos obrigatórios ao mover oportunidade para Ganho/Perdido.
 *
 * Spec: docs/70-ux/05-screen-funnel-board.md §6 (Drag-and-drop, passos 6-7)
 * Acionados por: T-12-20 (kanban.tsx wiring)
 * Server Actions: markWonAction / markLostAction (app/(app)/funnels/actions.ts)
 *
 * Acessibilidade AA:
 * - labels associados aos campos via htmlFor / id.
 * - onInteractOutside bloqueado (fechar sem confirmar não é permitido).
 * - foco retorna ao trigger após fechar.
 */

import * as React from 'react'
import { useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { markWonAction, markLostAction } from '@/app/(app)/funnels/actions'

// ---------------------------------------------------------------------------
// WonModal
// ---------------------------------------------------------------------------

export interface WonModalProps {
  /** Controlado externamente — true abre o dialog. */
  open: boolean
  /** ID da funnel_entry a marcar como ganha. */
  entryId: string
  /** Chamado após confirmação bem-sucedida. */
  onConfirm: () => void
  /** Chamado ao cancelar (sem salvar). */
  onCancel: () => void
}

/**
 * Dialog obrigatório ao arrastar card para coluna "Ganho".
 * Não fecha ao clicar fora (onInteractOutside bloqueado).
 */
export function WonModal({ open, entryId, onConfirm, onCancel }: WonModalProps) {
  const [transactionId, setTransactionId] = React.useState('')
  const [isManual, setIsManual] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Resetar estado ao abrir/fechar
  React.useEffect(() => {
    if (open) {
      setTransactionId('')
      setIsManual(false)
      setError(null)
    }
  }, [open])

  function handleConfirm() {
    setError(null)

    // Validação client-side: exige transactionId quando não é manual
    if (!isManual && transactionId.trim() === '') {
      setError('Informe o ID da transação ou ative "Venda manual".')
      return
    }

    startTransition(async () => {
      const result = await markWonAction({
        entryId,
        transactionId: isManual ? undefined : transactionId.trim(),
        isManual,
      })

      if (!result.ok) {
        setError(result.error.message)
        return
      }

      onConfirm()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Impede fechar ao clicar fora ou pressionar Escape sem confirmar
        if (!next) return
      }}
    >
      <DialogContent
        // Bloquear fechar ao clicar no overlay
        onInteractOutside={(e) => e.preventDefault()}
        // Bloquear fechar com Escape
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby="won-modal-desc"
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Confirmar ganho</DialogTitle>
          <DialogDescription id="won-modal-desc">
            Informe a transação vinculada ou marque como venda manual para registrar o ganho.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Campo: ID da transação */}
          <div className="grid gap-1.5">
            <Label htmlFor="won-transaction-id">ID da transação (opcional)</Label>
            <Input
              id="won-transaction-id"
              placeholder="tx_xxxxx"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              disabled={isManual || isPending}
              aria-disabled={isManual || isPending}
              autoComplete="off"
            />
          </div>

          {/* Toggle: Venda manual */}
          <div className="flex items-center gap-3">
            <Switch
              id="won-is-manual"
              checked={isManual}
              onCheckedChange={(checked) => {
                setIsManual(checked)
                if (checked) setTransactionId('')
                setError(null)
              }}
              disabled={isPending}
              aria-label="Venda manual"
            />
            <Label htmlFor="won-is-manual" className="cursor-pointer">
              Venda manual
            </Label>
          </div>

          {/* Erro */}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            type="button"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending}
            type="button"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending ? 'Salvando…' : 'Confirmar ganho'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// LostModal
// ---------------------------------------------------------------------------

export interface LostModalProps {
  /** Controlado externamente — true abre o dialog. */
  open: boolean
  /** ID da funnel_entry a marcar como perdida. */
  entryId: string
  /** Chamado após confirmação bem-sucedida. */
  onConfirm: () => void
  /** Chamado ao cancelar (sem salvar). */
  onCancel: () => void
}

/**
 * Dialog obrigatório ao arrastar card para coluna "Perdido".
 * `reason` é obrigatório (min 3 caracteres).
 * Não fecha ao clicar fora (onInteractOutside bloqueado).
 */
export function LostModal({ open, entryId, onConfirm, onCancel }: LostModalProps) {
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Resetar ao abrir/fechar
  React.useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
    }
  }, [open])

  function handleConfirm() {
    setError(null)

    // Validação client-side: motivo obrigatório (minLength 3 espelhando o schema Zod)
    if (reason.trim().length < 3) {
      setError('O motivo deve ter pelo menos 3 caracteres.')
      return
    }

    startTransition(async () => {
      const result = await markLostAction({
        entryId,
        reason: reason.trim(),
      })

      if (!result.ok) {
        setError(result.error.message)
        return
      }

      onConfirm()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) return
      }}
    >
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby="lost-modal-desc"
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Confirmar perda</DialogTitle>
          <DialogDescription id="lost-modal-desc">
            Informe o motivo pelo qual esta oportunidade foi perdida.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Campo: Motivo da perda */}
          <div className="grid gap-1.5">
            <Label htmlFor="lost-reason">
              Motivo da perda <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <Textarea
              id="lost-reason"
              placeholder="Descreva o motivo da perda..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              rows={3}
              aria-required="true"
              aria-invalid={error !== null ? 'true' : undefined}
              aria-describedby={error ? 'lost-reason-error' : undefined}
              className="resize-none"
            />
            {error && (
              <p id="lost-reason-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            type="button"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending || reason.trim().length < 3}
            type="button"
            variant="destructive"
          >
            {isPending ? 'Salvando…' : 'Confirmar perda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

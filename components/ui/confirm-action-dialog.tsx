'use client'

/**
 * ConfirmActionDialog — diálogo genérico de confirmação para ações destrutivas.
 *
 * Comportamento:
 * - Input de texto controlado pelo usuário.
 * - Botão de confirmação só se habilita quando input.trim() === requiredText.
 * - Botão "Cancelar" fecha sem confirmar.
 * - Fechar ao clicar fora é bloqueado (onInteractOutside: preventDefault).
 * - Enquanto isPending=true: botão mostra spinner, input desabilitado.
 *
 * Usa Dialog (não AlertDialog) para ter acesso a onInteractOutside via Radix.
 *
 * Spec: docs/70-ux/09-interaction-patterns.md §7 (Confirmações críticas)
 * T-12-32
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ConfirmActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Texto exato que o usuário deve digitar para habilitar o botão de confirmar (ex: "CONFIRMAR") */
  requiredText: string
  /** Rótulo do botão de confirmação. Padrão: "Confirmar" */
  confirmLabel?: string
  onConfirm: () => void
  isPending?: boolean
  variant?: 'destructive' | 'default'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  requiredText,
  confirmLabel = 'Confirmar',
  onConfirm,
  isPending = false,
  variant = 'destructive',
}: ConfirmActionDialogProps) {
  const [inputValue, setInputValue] = useState('')

  const isMatch = inputValue.trim() === requiredText

  function handleOpenChange(next: boolean) {
    if (!next && isPending) return // bloqueia fechar enquanto está processando
    if (!next) {
      // limpa o input ao fechar
      setInputValue('')
    }
    onOpenChange(next)
  }

  function handleConfirm() {
    if (!isMatch || isPending) return
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        // Bloqueia fechar ao clicar fora — ação destrutiva requer decisão explícita
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault()
        }}
        // Remove botão X padrão do DialogContent via className (não oculto, mas mantido)
        className="sm:max-w-md"
        aria-modal="true"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Campo de confirmação textual */}
        <div className="space-y-1.5 py-2">
          <Label htmlFor="confirm-action-input" className="text-sm font-medium">
            Digite{' '}
            <span
              className="font-mono font-semibold text-foreground"
              aria-label={`texto obrigatório: ${requiredText}`}
            >
              {requiredText}
            </span>{' '}
            para confirmar
          </Label>
          <Input
            id="confirm-action-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            aria-required="true"
            aria-describedby="confirm-action-hint"
            className={cn(
              'font-mono',
              inputValue.length > 0 && !isMatch && 'border-destructive focus-visible:ring-destructive',
              isMatch && 'border-emerald-500 focus-visible:ring-emerald-500',
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isMatch && !isPending) {
                handleConfirm()
              }
            }}
          />
          <p id="confirm-action-hint" className="text-xs text-muted-foreground">
            Este campo diferencia maiúsculas de minúsculas.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={handleConfirm}
            disabled={!isMatch || isPending}
            aria-disabled={!isMatch || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Aguarde...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

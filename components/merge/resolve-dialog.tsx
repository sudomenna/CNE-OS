'use client'

/**
 * ResolveDialog — Client Component para resolução de issue de identidade.
 * Abre um Dialog shadcn com textarea de resolução e select de status.
 */

import { useState, useTransition } from 'react'
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
import { Label } from '@/components/ui/label'
import { resolveIssueAction } from '@/app/(app)/contacts/[id]/issues/actions'

interface ResolveDialogProps {
  issueId: string
  contactId: string
}

export function ResolveDialog({ issueId, contactId: _contactId }: ResolveDialogProps) {
  const [open, setOpen] = useState(false)
  const [resolution, setResolution] = useState('')
  const [status, setStatus] = useState<'resolved' | 'ignored'>('resolved')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(value: boolean) {
    if (!value) {
      setResolution('')
      setStatus('resolved')
      setError(null)
    }
    setOpen(value)
  }

  function handleSubmit() {
    if (resolution.trim().length < 5) {
      setError('A resolução deve ter pelo menos 5 caracteres.')
      return
    }

    startTransition(async () => {
      const result = await resolveIssueAction({ issueId, resolution: resolution.trim(), status })
      if (result.ok) {
        setOpen(false)
        setResolution('')
        setStatus('resolved')
        setError(null)
      } else {
        setError(result.error.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Resolver
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolver pendência</DialogTitle>
          <DialogDescription>
            Descreva como a pendência foi tratada e selecione o desfecho.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`resolution-${issueId}`}>Descrição da resolução</Label>
            <textarea
              id={`resolution-${issueId}`}
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder="Descreva como a pendência foi resolvida..."
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              disabled={isPending}
              aria-required="true"
              aria-describedby={error ? `error-${issueId}` : undefined}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`status-${issueId}`}>Desfecho</Label>
            <select
              id={`status-${issueId}`}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'resolved' | 'ignored')}
              disabled={isPending}
            >
              <option value="resolved">Resolver (pendência tratada)</option>
              <option value="ignored">Ignorar (falso positivo)</option>
            </select>
          </div>

          {error && (
            <p
              id={`error-${issueId}`}
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
            type="button"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || resolution.trim().length < 5}
            type="button"
          >
            {isPending ? 'Salvando…' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

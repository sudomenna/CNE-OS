'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { inviteUser } from './actions'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  financial: 'Financeiro',
  marketing: 'Marketing',
  support: 'Suporte',
  commercial: 'Comercial',
}

const ROLES = Object.entries(ROLE_LABELS)

export function InviteUserForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    const form = new FormData(e.currentTarget)
    const result = await inviteUser({
      email: form.get('email'),
      fullName: form.get('fullName'),
      roleKind: form.get('roleKind'),
    })

    if (!result.ok) {
      setError(result.error.message)
    } else {
      setSuccess(true)
      // Fecha o dialog após 1.5s para o usuário ver a confirmação
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
      }, 1500)
    }
    setLoading(false)
  }

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    if (!newOpen) {
      setError(null)
      setSuccess(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Convidar usuário</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário interno</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="user-email">E-mail</Label>
            <Input
              id="user-email"
              name="email"
              type="email"
              required
              placeholder="nome@empresa.com.br"
              aria-required="true"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="user-full-name">Nome completo</Label>
            <Input
              id="user-full-name"
              name="fullName"
              required
              placeholder="Ana Souza"
              aria-required="true"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="user-role">Papel</Label>
            <select
              id="user-role"
              name="roleKind"
              required
              aria-required="true"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Selecione um papel</option>
              {ROLES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-green-600">
              Convite enviado com sucesso!
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || success}>
              {loading ? 'Enviando...' : 'Enviar convite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

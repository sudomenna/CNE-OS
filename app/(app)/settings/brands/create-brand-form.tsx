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
import { createBrand } from './actions'

export function CreateBrandForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const result = await createBrand({
      name: form.get('name'),
      slug: form.get('slug'),
    })

    if (!result.ok) {
      setError(result.error.message)
    } else {
      setOpen(false)
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Nova marca</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar marca</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="brand-name">Nome</Label>
            <Input
              id="brand-name"
              name="name"
              required
              placeholder="CNE Carreiras"
              aria-required="true"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="brand-slug">Slug</Label>
            <Input
              id="brand-slug"
              name="slug"
              required
              placeholder="cne-carreiras"
              pattern="^[a-z0-9][a-z0-9-]*$"
              aria-required="true"
              aria-describedby="brand-slug-hint"
            />
            <p id="brand-slug-hint" className="text-xs text-slate-400">
              Somente letras minúsculas, números e hífens.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Criando...' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

'use client'

/**
 * ProductsClient — componente Client para criar e arquivar produtos.
 * Inlined na página de produtos (sem components/catalog/).
 * Spec: T-6-04
 */

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
import { createProductAction, archiveProductAction } from './actions'

type Brand = { id: string; name: string; slug: string }

type Props =
  | { mode: 'create-only'; brands: Brand[]; productId?: never; productName?: never }
  | { mode: 'archive-only'; brands: Brand[]; productId: string; productName: string }

const KIND_OPTIONS = [
  { value: 'course', label: 'Curso' },
  { value: 'ebook', label: 'E-book' },
  { value: 'training_online', label: 'Treinamento online' },
  { value: 'training_in_person', label: 'Treinamento presencial' },
  { value: 'mentoring', label: 'Mentoria' },
  { value: 'bonus', label: 'Bônus' },
  { value: 'other', label: 'Outro' },
] as const

export function ProductsClient({ mode, brands, productId, productName }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- Create product form ----
  if (mode === 'create-only') {
    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault()
      setLoading(true)
      setError(null)

      const form = new FormData(e.currentTarget)
      const result = await createProductAction({
        brandId: form.get('brandId'),
        name: form.get('name'),
        slug: form.get('slug'),
        kind: form.get('kind'),
        description: form.get('description') || null,
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
          <Button size="sm">Novo produto</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar produto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label htmlFor="product-brand">Marca</Label>
              <select
                id="product-brand"
                name="brandId"
                required
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-required="true"
              >
                <option value="">Selecione uma marca</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="product-name">Nome</Label>
              <Input
                id="product-name"
                name="name"
                required
                placeholder="Excel do Zero"
                aria-required="true"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="product-slug">Slug</Label>
              <Input
                id="product-slug"
                name="slug"
                required
                placeholder="excel-do-zero"
                pattern="^[a-z0-9][a-z0-9-]*$"
                aria-required="true"
                aria-describedby="product-slug-hint"
              />
              <p id="product-slug-hint" className="text-xs text-muted-foreground/60">
                Somente letras minúsculas, números e hífens.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="product-kind">Tipo</Label>
              <select
                id="product-kind"
                name="kind"
                required
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-required="true"
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="product-description">Descrição (opcional)</Label>
              <textarea
                id="product-description"
                name="description"
                rows={3}
                placeholder="Descreva o produto..."
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
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

  // ---- Archive product confirmation ----
  async function handleArchive() {
    setLoading(true)
    setError(null)

    const result = await archiveProductAction({ productId })

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
        <Button
          size="sm"
          variant="outline"
          className="text-muted-foreground hover:text-red-600 hover:border-red-300"
          aria-label={`Arquivar produto ${productName}`}
        >
          Arquivar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arquivar produto</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja arquivar o produto{' '}
            <span className="font-semibold">{productName}</span>? Ele não poderá ser incluído
            em novas condições de oferta, mas permanecerá visível no histórico de transações.
          </p>
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
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchive}
              disabled={loading}
            >
              {loading ? 'Arquivando...' : 'Arquivar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'

/**
 * CategoriesClient — componente Client para criar e excluir categorias de produto.
 * Inlined na página de categorias (sem components/catalog/).
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
import { createCategoryAction, archiveCategoryAction } from './actions'

type Brand = { id: string; name: string; slug: string }
type Category = { id: string; name: string; brandId: string; parentId: string | null }

type Props =
  | { mode: 'create-only'; brands: Brand[]; categories: Category[]; categoryId?: never; categoryName?: never }
  | { mode: 'archive-only'; brands: Brand[]; categories: Category[]; categoryId: string; categoryName: string }

export function CategoriesClient({ mode, brands, categories, categoryId, categoryName }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBrandId, setSelectedBrandId] = useState('')

  // Filtra categorias para as do mesmo brand (para seleção de pai)
  const parentOptions = categories.filter(
    (c) => c.brandId === selectedBrandId && c.id !== categoryId,
  )

  // ---- Create category form ----
  if (mode === 'create-only') {
    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault()
      setLoading(true)
      setError(null)

      const form = new FormData(e.currentTarget)
      const parentId = form.get('parentId') as string | null
      const result = await createCategoryAction({
        brandId: form.get('brandId'),
        name: form.get('name'),
        slug: form.get('slug'),
        parentId: parentId && parentId !== '' ? parentId : null,
      })

      if (!result.ok) {
        setError(result.error.message)
      } else {
        setOpen(false)
        setSelectedBrandId('')
      }
      setLoading(false)
    }

    return (
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelectedBrandId('') }}>
        <DialogTrigger asChild>
          <Button size="sm">Nova categoria</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar categoria</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label htmlFor="cat-brand">Marca</Label>
              <select
                id="cat-brand"
                name="brandId"
                required
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
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
              <Label htmlFor="cat-name">Nome</Label>
              <Input
                id="cat-name"
                name="name"
                required
                placeholder="Cursos de Excel"
                aria-required="true"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input
                id="cat-slug"
                name="slug"
                required
                placeholder="cursos-de-excel"
                pattern="^[a-z0-9][a-z0-9-]*$"
                aria-required="true"
                aria-describedby="cat-slug-hint"
              />
              <p id="cat-slug-hint" className="text-xs text-slate-400">
                Somente letras minúsculas, números e hífens.
              </p>
            </div>
            {parentOptions.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="cat-parent">Categoria pai (opcional)</Label>
                <select
                  id="cat-parent"
                  name="parentId"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <option value="">Nenhuma (categoria raiz)</option>
                  {parentOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setOpen(false); setSelectedBrandId('') }}
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

  // ---- Archive (delete) category confirmation ----
  async function handleArchive() {
    setLoading(true)
    setError(null)

    const result = await archiveCategoryAction({ categoryId })

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
          className="text-slate-500 hover:text-red-600 hover:border-red-300"
          aria-label={`Excluir categoria ${categoryName}`}
        >
          Excluir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir categoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-slate-600">
            Tem certeza que deseja excluir a categoria{' '}
            <span className="font-semibold">{categoryName}</span>? Os produtos vinculados a ela
            ficam sem categoria. Subcategorias filhas perdem a referência pai.
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
              {loading ? 'Excluindo...' : 'Excluir'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

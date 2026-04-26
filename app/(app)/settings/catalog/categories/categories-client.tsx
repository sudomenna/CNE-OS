'use client'

/**
 * CategoriesClient — componente Client para criar, editar e excluir categorias de produto.
 * Inlined na página de categorias (sem components/catalog/).
 * Spec: T-6-04, T-12-26
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
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { createCategoryAction, archiveCategoryAction, updateCategoryAction } from './actions'

type Brand = { id: string; name: string; slug: string }
type Category = { id: string; name: string; brandId: string; parentId: string | null }

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

type CreateProps = {
  brands: Brand[]
  categories: Category[]
}

export function CategoryCreateButton({ brands, categories }: CreateProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBrandId, setSelectedBrandId] = useState('')

  const parentOptions = categories.filter((c) => c.brandId === selectedBrandId)

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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setSelectedBrandId('')
      }}
    >
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
            <p id="cat-slug-hint" className="text-xs text-muted-foreground/60">
              Somente letras minúsculas, números e hífens.
            </p>
          </div>
          {parentOptions.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="cat-parent">Categoria pai (opcional)</Label>
              <select
                id="cat-parent"
                name="parentId"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              onClick={() => {
                setOpen(false)
                setSelectedBrandId('')
              }}
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

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

type EditProps = {
  category: Category
  categories: Category[]
}

export function CategoryEditButton({ category, categories }: EditProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Exclude self from parent options, only show same brand
  const parentOptions = categories.filter(
    (c) => c.brandId === category.brandId && c.id !== category.id,
  )

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const parentId = form.get('parentId') as string | null
    const result = await updateCategoryAction({
      categoryId: category.id,
      name: form.get('name'),
      parentId: parentId && parentId !== '' ? parentId : null,
    })

    if (!result.ok) {
      setError(result.error.message)
    } else {
      setOpen(false)
    }
    setLoading(false)
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Editar categoria ${category.name}`}
        >
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar categoria</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleEdit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="edit-cat-name">Nome</Label>
            <Input
              id="edit-cat-name"
              name="name"
              required
              defaultValue={category.name}
              aria-required="true"
            />
          </div>
          {/* Slug read-only */}
          <div className="space-y-1">
            <Label htmlFor="edit-cat-slug">Slug</Label>
            <Input
              id="edit-cat-slug"
              value={category.id}
              readOnly
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground/60">
              O slug não pode ser alterado após a criação.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-cat-parent">Categoria pai (opcional)</Label>
            <select
              id="edit-cat-parent"
              name="parentId"
              defaultValue={category.parentId ?? ''}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Nenhuma (categoria raiz)</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete (ConfirmActionDialog) — rejeita se referenciada por produto ativo
// ---------------------------------------------------------------------------

type DeleteProps = {
  categoryId: string
  categoryName: string
}

export function CategoryDeleteButton({ categoryId, categoryName }: DeleteProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await archiveCategoryAction({ categoryId })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
    } else {
      setOpen(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-muted-foreground hover:text-red-600 hover:border-red-300"
        aria-label={`Excluir categoria ${categoryName}`}
        onClick={() => setOpen(true)}
      >
        Excluir
      </Button>

      {error && (
        <p
          role="alert"
          className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2 mt-1"
        >
          {error}
        </p>
      )}

      {/* Confirmação textual — ação destrutiva */}
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Excluir categoria?"
        description={`A categoria "${categoryName}" será removida. Os produtos vinculados a ela ficarão sem categoria. Subcategorias filhas perderão a referência pai. Esta ação falhará se houver produtos ativos vinculados a esta categoria.`}
        requiredText="CONFIRMAR"
        confirmLabel="Excluir categoria"
        onConfirm={handleDelete}
        isPending={loading}
        variant="destructive"
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Legacy export — kept for backwards compat during migration
// ---------------------------------------------------------------------------

type LegacyProps =
  | { mode: 'create-only'; brands: Brand[]; categories: Category[]; categoryId?: never; categoryName?: never }
  | { mode: 'archive-only'; brands: Brand[]; categories: Category[]; categoryId: string; categoryName: string }

/**
 * @deprecated Use CategoryCreateButton / CategoryEditButton / CategoryDeleteButton directly.
 */
export function CategoriesClient({ mode, brands, categories, categoryId, categoryName }: LegacyProps) {
  if (mode === 'create-only') {
    return <CategoryCreateButton brands={brands} categories={categories} />
  }
  return <CategoryDeleteButton categoryId={categoryId!} categoryName={categoryName!} />
}

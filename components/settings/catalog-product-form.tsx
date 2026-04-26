'use client'

/**
 * CatalogProductForm — formulário de criação/edição de produto do catálogo.
 * Usado em Sheet/Dialog nas páginas de produtos.
 *
 * Spec: docs/20-domain/09-catalog.md §3.1, T-12-26
 * Actions: createProductAction | updateProductAction
 */

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  createProductAction,
  updateProductAction,
  archiveProductAction,
} from '@/app/(app)/settings/catalog/products/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductFormBrand = { id: string; name: string; slug: string }
export type ProductFormCategory = { id: string; name: string; brandId: string }

const KIND_OPTIONS = [
  { value: 'course', label: 'Curso' },
  { value: 'ebook', label: 'E-book' },
  { value: 'training_online', label: 'Treinamento online' },
  { value: 'training_in_person', label: 'Treinamento presencial' },
  { value: 'mentoring', label: 'Mentoria' },
  { value: 'bonus', label: 'Bônus' },
  { value: 'other', label: 'Outro' },
] as const

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  brandId: z.string().uuid('Selecione uma marca'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200),
  slug: z
    .string()
    .min(2, 'Slug deve ter ao menos 2 caracteres')
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug deve ser kebab-case (letras minúsculas, números e hífens)'),
  kind: z.enum(['course', 'ebook', 'training_online', 'training_in_person', 'mentoring', 'bonus', 'other']),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
})

const editSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200),
  kind: z.enum(['course', 'ebook', 'training_online', 'training_in_person', 'mentoring', 'bonus', 'other']),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
})

type CreateFormValues = z.infer<typeof createSchema>
type EditFormValues = z.infer<typeof editSchema>

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

type CreateProps = {
  brands: ProductFormBrand[]
  categories: ProductFormCategory[]
  trigger?: React.ReactNode
  onSuccess?: () => void
}

export function CatalogProductCreateForm({ brands, categories, trigger, onSuccess }: CreateProps) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [selectedBrandId, setSelectedBrandId] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { kind: 'other' },
  })

  const filteredCategories = categories.filter((c) => c.brandId === selectedBrandId)

  async function onSubmit(values: CreateFormValues) {
    setServerError(null)
    const result = await createProductAction({
      brandId: values.brandId,
      name: values.name,
      slug: values.slug,
      kind: values.kind,
      categoryId: values.categoryId || null,
      description: values.description || null,
    })

    if (!result.ok) {
      setServerError(result.error.message)
      return
    }

    reset()
    setSelectedBrandId('')
    setOpen(false)
    onSuccess?.()
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      reset()
      setSelectedBrandId('')
      setServerError(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? <Button size="sm">Novo produto</Button>}
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Criar produto</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          {/* Marca */}
          <div className="space-y-1.5">
            <Label htmlFor="cp-brandId">Marca <span aria-hidden>*</span></Label>
            <select
              id="cp-brandId"
              aria-required="true"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register('brandId')}
              onChange={(e) => {
                setValue('brandId', e.target.value)
                setValue('categoryId', null)
                setSelectedBrandId(e.target.value)
              }}
            >
              <option value="">Selecione uma marca</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.brandId && (
              <p className="text-xs text-red-600" role="alert">{errors.brandId.message}</p>
            )}
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="cp-name">Nome <span aria-hidden>*</span></Label>
            <Input
              id="cp-name"
              placeholder="Excel do Zero"
              aria-required="true"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-red-600" role="alert">{errors.name.message}</p>
            )}
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <Label htmlFor="cp-slug">Slug <span aria-hidden>*</span></Label>
            <Input
              id="cp-slug"
              placeholder="excel-do-zero"
              aria-required="true"
              aria-invalid={!!errors.slug}
              aria-describedby="cp-slug-hint"
              {...register('slug')}
            />
            <p id="cp-slug-hint" className="text-xs text-muted-foreground">
              Somente letras minúsculas, números e hífens. Imutável após criação.
            </p>
            {errors.slug && (
              <p className="text-xs text-red-600" role="alert">{errors.slug.message}</p>
            )}
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label htmlFor="cp-kind">Tipo <span aria-hidden>*</span></Label>
            <select
              id="cp-kind"
              aria-required="true"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register('kind')}
            >
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {errors.kind && (
              <p className="text-xs text-red-600" role="alert">{errors.kind.message}</p>
            )}
          </div>

          {/* Categoria */}
          {filteredCategories.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-categoryId">Categoria (opcional)</Label>
              <select
                id="cp-categoryId"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register('categoryId')}
              >
                <option value="">Sem categoria</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="cp-description">Descrição (opcional)</Label>
            <textarea
              id="cp-description"
              rows={3}
              placeholder="Descreva o produto..."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-red-600" role="alert">{errors.description.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2" role="alert">
              {serverError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Criando...' : 'Criar produto'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Edit form
// ---------------------------------------------------------------------------

type EditProduct = {
  id: string
  name: string
  slug: string
  kind: string
  categoryId: string | null
  description: string | null
  brandId: string
  status: string
}

type EditProps = {
  product: EditProduct
  categories: ProductFormCategory[]
  trigger?: React.ReactNode
  onSuccess?: () => void
}

export function CatalogProductEditForm({ product: prod, categories, trigger, onSuccess }: EditProps) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const filteredCategories = categories.filter((c) => c.brandId === prod.brandId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: prod.name,
      kind: prod.kind as EditFormValues['kind'],
      categoryId: prod.categoryId,
      description: prod.description ?? '',
    },
  })

  async function onSubmit(values: EditFormValues) {
    setServerError(null)
    const result = await updateProductAction({
      productId: prod.id,
      name: values.name,
      kind: values.kind,
      categoryId: values.categoryId || null,
      description: values.description || null,
    })

    if (!result.ok) {
      setServerError(result.error.message)
      return
    }

    setOpen(false)
    onSuccess?.()
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      reset({
        name: prod.name,
        kind: prod.kind as EditFormValues['kind'],
        categoryId: prod.categoryId,
        description: prod.description ?? '',
      })
      setServerError(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" aria-label={`Editar produto ${prod.name}`}>
            Editar
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Editar produto</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-name">Nome <span aria-hidden>*</span></Label>
            <Input
              id="ep-name"
              aria-required="true"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-red-600" role="alert">{errors.name.message}</p>
            )}
          </div>

          {/* Slug (read-only) */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-slug">Slug</Label>
            <Input
              id="ep-slug"
              value={prod.slug}
              readOnly
              disabled
              aria-describedby="ep-slug-hint"
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p id="ep-slug-hint" className="text-xs text-muted-foreground">
              O slug não pode ser alterado após a criação.
            </p>
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-kind">Tipo <span aria-hidden>*</span></Label>
            <select
              id="ep-kind"
              aria-required="true"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register('kind')}
            >
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {errors.kind && (
              <p className="text-xs text-red-600" role="alert">{errors.kind.message}</p>
            )}
          </div>

          {/* Categoria */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-categoryId">Categoria (opcional)</Label>
            <select
              id="ep-categoryId"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register('categoryId')}
            >
              <option value="">Sem categoria</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-description">Descrição (opcional)</Label>
            <textarea
              id="ep-description"
              rows={3}
              placeholder="Descreva o produto..."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              {...register('description')}
            />
          </div>

          {serverError && (
            <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2" role="alert">
              {serverError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Archive confirmation (ConfirmActionDialog)
// ---------------------------------------------------------------------------

type ArchiveProps = {
  productId: string
  productName: string
  trigger?: React.ReactNode
  onSuccess?: () => void
}

export function CatalogProductArchiveDialog({ productId, productName, trigger, onSuccess }: ArchiveProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleArchive() {
    setLoading(true)
    setError(null)
    const result = await archiveProductAction({ productId })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    setOpen(false)
    onSuccess?.()
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="text-muted-foreground hover:text-red-600 hover:border-red-300"
            aria-label={`Arquivar produto ${productName}`}
          >
            Arquivar
          </Button>
        )}
      </span>

      {error && (
        <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2 mt-1" role="alert">
          {error}
        </p>
      )}

      {/* Confirmação textual — ação destrutiva */}
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Arquivar produto?"
        description={`O produto "${productName}" será arquivado e não poderá ser incluído em novas condições de oferta. Ele permanecerá visível no histórico de transações. Esta ação pode ser revertida pelo administrador.`}
        requiredText="CONFIRMAR"
        confirmLabel="Arquivar produto"
        onConfirm={handleArchive}
        isPending={loading}
        variant="destructive"
      />
    </>
  )
}

'use client'

/**
 * CatalogBenefitForm — formulário de criação/edição de benefício comercial.
 * Usado em Sheet nas páginas de benefícios.
 *
 * Spec: docs/20-domain/09-catalog.md §3.3, T-12-26
 * Actions: createBenefitAction | updateBenefitAction
 */

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  createBenefitAction,
  updateBenefitAction,
  archiveBenefitAction,
} from '@/app/(app)/settings/catalog/benefits/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BenefitFormBrand = { id: string; name: string; slug: string }

// ---------------------------------------------------------------------------
// Zod schemas — using string fields for duration so react-hook-form stays clean
// ---------------------------------------------------------------------------

const createSchema = z.object({
  brandId: z.string().uuid('Selecione uma marca'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200),
  slug: z
    .string()
    .min(2, 'Slug deve ter ao menos 2 caracteres')
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug deve ser kebab-case (letras minúsculas, números e hífens)'),
  description: z.string().max(2000).optional(),
  // kept as string; converted before calling action
  autoTag: z.string().optional(),
  defaultDurationMonthsStr: z.string().optional(),
  deliveryStatusRequired: z.boolean().optional(),
})

const editSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200),
  description: z.string().max(2000).optional(),
  autoTag: z.string().optional(),
  defaultDurationMonthsStr: z.string().optional(),
  deliveryStatusRequired: z.boolean().optional(),
})

type CreateFormValues = z.infer<typeof createSchema>
type EditFormValues = z.infer<typeof editSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAutoTag(v: string | undefined): string | null {
  if (!v || v.trim() === '') return null
  const trimmed = v.trim()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) return null
  return trimmed
}

function parseDuration(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null
  const n = parseInt(v, 10)
  if (isNaN(n) || n < 1) return null
  return n
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

type CreateProps = {
  brands: BenefitFormBrand[]
  trigger?: React.ReactNode
  onSuccess?: () => void
}

export function CatalogBenefitCreateForm({ brands, trigger, onSuccess }: CreateProps) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [deliveryRequired, setDeliveryRequired] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      deliveryStatusRequired: false,
      autoTag: '',
      defaultDurationMonthsStr: '',
    },
  })

  async function onSubmit(values: CreateFormValues) {
    setServerError(null)

    // Validate autoTag format before calling action
    const autoTagRaw = parseAutoTag(values.autoTag)
    if (values.autoTag && values.autoTag.trim() !== '' && autoTagRaw === null) {
      setServerError('Tag automática deve ser kebab-case (letras minúsculas, números e hífens).')
      return
    }

    const result = await createBenefitAction({
      brandId: values.brandId,
      name: values.name,
      slug: values.slug,
      description: values.description || null,
      autoTag: autoTagRaw,
      defaultDurationMonths: parseDuration(values.defaultDurationMonthsStr),
      deliveryStatusRequired: values.deliveryStatusRequired ?? false,
    })

    if (!result.ok) {
      setServerError(result.error.message)
      return
    }

    reset()
    setDeliveryRequired(false)
    setOpen(false)
    onSuccess?.()
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      reset()
      setDeliveryRequired(false)
      setServerError(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? <Button size="sm">Novo benefício</Button>}
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Criar benefício comercial</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          {/* Marca */}
          <div className="space-y-1.5">
            <Label htmlFor="cb-brandId">Marca <span aria-hidden>*</span></Label>
            <select
              id="cb-brandId"
              aria-required="true"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register('brandId')}
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
            <Label htmlFor="cb-name">Nome <span aria-hidden>*</span></Label>
            <Input
              id="cb-name"
              placeholder="Grupo VIP de Suporte"
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
            <Label htmlFor="cb-slug">Slug <span aria-hidden>*</span></Label>
            <Input
              id="cb-slug"
              placeholder="grupo-vip-suporte"
              aria-required="true"
              aria-invalid={!!errors.slug}
              aria-describedby="cb-slug-hint"
              {...register('slug')}
            />
            <p id="cb-slug-hint" className="text-xs text-muted-foreground">
              Somente letras minúsculas, números e hífens. Imutável após criação.
            </p>
            {errors.slug && (
              <p className="text-xs text-red-600" role="alert">{errors.slug.message}</p>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="cb-description">Descrição (opcional)</Label>
            <textarea
              id="cb-description"
              rows={2}
              placeholder="Descreva o benefício..."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              {...register('description')}
            />
          </div>

          {/* Tag automática */}
          <div className="space-y-1.5">
            <Label htmlFor="cb-autoTag">Tag automática (opcional)</Label>
            <Input
              id="cb-autoTag"
              placeholder="vip-suporte"
              aria-describedby="cb-autoTag-hint"
              {...register('autoTag')}
            />
            <p id="cb-autoTag-hint" className="text-xs text-muted-foreground">
              Tag aplicada ao contato ao aprovar transação com este benefício. Kebab-case.
            </p>
          </div>

          {/* Vigência padrão */}
          <div className="space-y-1.5">
            <Label htmlFor="cb-duration">Vigência padrão em meses (opcional)</Label>
            <Input
              id="cb-duration"
              type="number"
              min="1"
              placeholder="12"
              aria-describedby="cb-duration-hint"
              {...register('defaultDurationMonthsStr')}
            />
            <p id="cb-duration-hint" className="text-xs text-muted-foreground">
              Deixe em branco para vigência perpétua.
            </p>
          </div>

          {/* Exigir entrega */}
          <div className="flex items-center gap-3">
            <Switch
              id="cb-deliveryRequired"
              checked={deliveryRequired}
              onCheckedChange={(checked) => {
                setDeliveryRequired(checked)
                setValue('deliveryStatusRequired', checked)
              }}
              aria-describedby="cb-delivery-hint"
            />
            <div>
              <Label htmlFor="cb-deliveryRequired" className="cursor-pointer">
                Exigir confirmação de entrega
              </Label>
              <p id="cb-delivery-hint" className="text-xs text-muted-foreground">
                Itens gerados por este benefício precisam ter entrega confirmada.
              </p>
            </div>
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
              {isSubmitting ? 'Criando...' : 'Criar benefício'}
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

type EditBenefit = {
  id: string
  name: string
  slug: string
  description: string | null
  autoTag: string | null
  defaultDurationMonths: number | null
  deliveryStatusRequired: boolean
  status: string
}

type EditProps = {
  benefit: EditBenefit
  trigger?: React.ReactNode
  onSuccess?: () => void
}

export function CatalogBenefitEditForm({ benefit, trigger, onSuccess }: EditProps) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [deliveryRequired, setDeliveryRequired] = useState(benefit.deliveryStatusRequired)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: benefit.name,
      description: benefit.description ?? '',
      autoTag: benefit.autoTag ?? '',
      defaultDurationMonthsStr: benefit.defaultDurationMonths?.toString() ?? '',
      deliveryStatusRequired: benefit.deliveryStatusRequired,
    },
  })

  async function onSubmit(values: EditFormValues) {
    setServerError(null)

    const autoTagRaw = parseAutoTag(values.autoTag)
    if (values.autoTag && values.autoTag.trim() !== '' && autoTagRaw === null) {
      setServerError('Tag automática deve ser kebab-case (letras minúsculas, números e hífens).')
      return
    }

    const result = await updateBenefitAction({
      benefitId: benefit.id,
      name: values.name,
      description: values.description || null,
      autoTag: autoTagRaw,
      defaultDurationMonths: parseDuration(values.defaultDurationMonthsStr),
      deliveryStatusRequired: values.deliveryStatusRequired ?? false,
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
        name: benefit.name,
        description: benefit.description ?? '',
        autoTag: benefit.autoTag ?? '',
        defaultDurationMonthsStr: benefit.defaultDurationMonths?.toString() ?? '',
        deliveryStatusRequired: benefit.deliveryStatusRequired,
      })
      setDeliveryRequired(benefit.deliveryStatusRequired)
      setServerError(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" aria-label={`Editar benefício ${benefit.name}`}>
            Editar
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Editar benefício</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="eb-name">Nome <span aria-hidden>*</span></Label>
            <Input
              id="eb-name"
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
            <Label htmlFor="eb-slug">Slug</Label>
            <Input
              id="eb-slug"
              value={benefit.slug}
              readOnly
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              O slug não pode ser alterado após a criação.
            </p>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="eb-description">Descrição (opcional)</Label>
            <textarea
              id="eb-description"
              rows={2}
              placeholder="Descreva o benefício..."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              {...register('description')}
            />
          </div>

          {/* Tag automática */}
          <div className="space-y-1.5">
            <Label htmlFor="eb-autoTag">Tag automática (opcional)</Label>
            <Input
              id="eb-autoTag"
              placeholder="vip-suporte"
              aria-describedby="eb-autoTag-hint"
              {...register('autoTag')}
            />
            <p id="eb-autoTag-hint" className="text-xs text-muted-foreground">
              Tag aplicada ao contato ao aprovar transação com este benefício. Kebab-case.
            </p>
          </div>

          {/* Vigência padrão */}
          <div className="space-y-1.5">
            <Label htmlFor="eb-duration">Vigência padrão em meses (opcional)</Label>
            <Input
              id="eb-duration"
              type="number"
              min="1"
              placeholder="12"
              aria-describedby="eb-duration-hint"
              {...register('defaultDurationMonthsStr')}
            />
            <p id="eb-duration-hint" className="text-xs text-muted-foreground">
              Deixe em branco para vigência perpétua.
            </p>
          </div>

          {/* Exigir entrega */}
          <div className="flex items-center gap-3">
            <Switch
              id="eb-deliveryRequired"
              checked={deliveryRequired}
              onCheckedChange={(checked) => {
                setDeliveryRequired(checked)
                setValue('deliveryStatusRequired', checked)
              }}
            />
            <Label htmlFor="eb-deliveryRequired" className="cursor-pointer">
              Exigir confirmação de entrega
            </Label>
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
// Archive confirmation (AlertDialog)
// ---------------------------------------------------------------------------

type ArchiveProps = {
  benefitId: string
  benefitName: string
  trigger?: React.ReactNode
  onSuccess?: () => void
}

export function CatalogBenefitArchiveDialog({ benefitId, benefitName, trigger, onSuccess }: ArchiveProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleArchive() {
    setLoading(true)
    setError(null)
    const result = await archiveBenefitAction({ benefitId })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    onSuccess?.()
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="text-muted-foreground hover:text-red-600 hover:border-red-300"
            aria-label={`Arquivar benefício ${benefitName}`}
          >
            Arquivar
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar benefício?</AlertDialogTitle>
          <AlertDialogDescription>
            O benefício <strong>{benefitName}</strong> será arquivado e não poderá ser incluído
            em novas condições de oferta. Ele permanecerá visível no histórico de transações.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleArchive}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? 'Arquivando...' : 'Arquivar benefício'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

'use client'

/**
 * OfferStep1Form — edita metadados de oferta existente no Passo 1 do wizard.
 *
 * Campos: nome, slug (auto-derivado), descrição interna, tipo (regular/renewal).
 * Ao salvar chama updateOfferAction.
 *
 * T-12 — spec: docs/70-ux/06-screen-offer-builder.md §2
 */

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import { updateOfferAction } from '@/app/(app)/offers/actions'
import { normalizeSlug } from '@/lib/domain/catalog/normalize'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const step1Schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  slug: z
    .string()
    .min(1, 'Slug é obrigatório')
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug deve ser kebab-case (letras minúsculas, números, hífens)'),
  description: z.string().max(2000).optional(),
  type: z.enum(['regular', 'renewal']),
})

type Step1Values = z.infer<typeof step1Schema>

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OfferStep1FormProps {
  offerId: string
  defaultValues: {
    name: string
    slug: string
    description?: string | null
    type: 'regular' | 'renewal'
  }
  /** Callback chamado após salvar com sucesso */
  onSaved?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OfferStep1Form({ offerId, defaultValues, onSaved }: OfferStep1FormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = React.useState(false)

  const form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      name: defaultValues.name,
      slug: defaultValues.slug,
      description: defaultValues.description ?? '',
      type: defaultValues.type,
    },
  })

  const { isSubmitting } = form.formState

  // Auto-derive slug from name when slug hasn't been manually touched
  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const currentSlug = form.getValues('slug')
    const isDefault = currentSlug === normalizeSlug(form.getValues('name')) || currentSlug === ''
    if (isDefault) {
      form.setValue('slug', normalizeSlug(e.target.value), { shouldValidate: false })
    }
  }

  async function onSubmit(values: Step1Values) {
    setServerError(null)
    setSaveSuccess(false)

    const result = await updateOfferAction({
      offerId,
      name: values.name,
      slug: values.slug,
      description: values.description || null,
      type: values.type,
    })

    if (!result.ok) {
      setServerError(result.error.message)
      return
    }

    setSaveSuccess(true)
    onSaved?.()
  }

  return (
    <Form {...form}>
      <form
        id="offer-step1-form"
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        {/* Nome */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Nome <span aria-hidden="true" className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Curso Avançado de React"
                  autoComplete="off"
                  onChange={(e) => {
                    field.onChange(e)
                    handleNameChange(e)
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Slug */}
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Slug{' '}
                <span className="text-xs text-muted-foreground font-normal">
                  (auto-gerado; apenas letras minúsculas, números e hífens)
                </span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="curso-avancado-de-react"
                  autoComplete="off"
                  onBlur={(e) => {
                    field.onBlur()
                    field.onChange(normalizeSlug(e.target.value))
                  }}
                />
              </FormControl>
              <FormDescription>
                Único por marca. Usado em URLs e referências internas.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tipo */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de oferta</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex gap-6"
                  aria-label="Tipo de oferta"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="regular" id="type-regular" />
                    <Label htmlFor="type-regular" className="cursor-pointer font-normal">
                      Regular
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="renewal" id="type-renewal" />
                    <Label htmlFor="type-renewal" className="cursor-pointer font-normal">
                      Renovação
                    </Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Descrição */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição interna</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Descreva o objetivo comercial desta oferta…"
                  rows={3}
                  maxLength={2000}
                  className="resize-none"
                />
              </FormControl>
              <FormDescription>Visível apenas para operadores.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Server error */}
        {serverError && (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {serverError}
          </p>
        )}

        {/* Success feedback */}
        {saveSuccess && (
          <p
            role="status"
            className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
          >
            Dados salvos com sucesso.
          </p>
        )}

        {/* Hidden submit — triggered by the wizard footer via form="offer-step1-form" */}
        <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} disabled={isSubmitting}>
          Salvar
        </button>
      </form>
    </Form>
  )
}

'use client'

import { useState, useCallback, KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

import { createContactAction } from '@/app/(app)/contacts/actions'

// ---------------------------------------------------------------------------
// Schema de validação — alinhado com contactClassificationEnum do schema Drizzle
// (lead | customer | student | paid_lead)
//
// Usamos z.infer<> diretamente (sem .default()) para que input e output coincidam.
// Os defaults são fornecidos via defaultValues no useForm.
// ---------------------------------------------------------------------------

const contactFormSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  cpf: z.string().optional(),
  phone: z.string().optional(),
  email: z.union([z.string().email('Email inválido'), z.literal('')]).optional(),
  classification: z.enum(['lead', 'customer', 'student', 'paid_lead']),
  tags: z.array(z.string()),
  brandId: z.string().uuid('Selecione uma marca válida'),
  notes: z.string().optional(),
})

type ContactFormValues = z.infer<typeof contactFormSchema>

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContactFormProps {
  brands: { id: string; name: string }[]
}

// ---------------------------------------------------------------------------
// Helpers de máscara — sem lib externa (INV-CONTACT-08)
// ---------------------------------------------------------------------------

function applyCpfMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

function applyPhoneMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  lead: 'Lead',
  customer: 'Cliente',
  student: 'Aluno',
  paid_lead: 'Lead Pago',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContactForm({ brands }: ContactFormProps) {
  const router = useRouter()
  const [tagInput, setTagInput] = useState('')

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: '',
      cpf: '',
      phone: '',
      email: '',
      classification: 'lead',
      tags: [],
      brandId: brands[0]?.id ?? '',
      notes: '',
    },
  })

  const tags = form.watch('tags')

  const addTag = useCallback(
    (value: string) => {
      const trimmed = value.trim().toLowerCase().replace(/\s+/g, '-')
      if (!trimmed) return
      const current = form.getValues('tags')
      if (!current.includes(trimmed)) {
        form.setValue('tags', [...current, trimmed], { shouldValidate: false })
      }
      setTagInput('')
    },
    [form],
  )

  const removeTag = useCallback(
    (tag: string) => {
      const current = form.getValues('tags')
      form.setValue(
        'tags',
        current.filter((t) => t !== tag),
        { shouldValidate: false },
      )
    },
    [form],
  )

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  const onSubmit = async (values: ContactFormValues) => {
    const result = await createContactAction(values)

    if (!result.ok) {
      toast.error(result.error.message ?? 'Erro ao criar contato')
      return
    }

    toast.success('Contato criado com sucesso')
    router.push(`/contacts/${result.data.contactId}`)
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        aria-label="Formulário de novo contato"
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
                  placeholder="Nome completo"
                  autoComplete="name"
                  aria-required="true"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* CPF + Telefone — linha horizontal em telas grandes */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="cpf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CPF</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    autoComplete="off"
                    value={field.value ?? ''}
                    onInput={(e) => {
                      const masked = applyCpfMask(e.currentTarget.value)
                      e.currentTarget.value = masked
                      field.onChange(masked)
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefone</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    autoComplete="tel"
                    value={field.value ?? ''}
                    onInput={(e) => {
                      const masked = applyPhoneMask(e.currentTarget.value)
                      e.currentTarget.value = masked
                      field.onChange(masked)
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  placeholder="contato@exemplo.com"
                  autoComplete="email"
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Classificação + Marca — linha horizontal */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="classification"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Classificação</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger aria-label="Classificação do contato">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="brandId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Marca <span aria-hidden="true" className="text-destructive">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger aria-label="Marca do contato">
                      <SelectValue placeholder="Selecione uma marca..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label htmlFor="tag-input">Tags</Label>
          <div
            role="group"
            aria-labelledby="tag-input-label"
            className="flex flex-wrap gap-2 rounded-md border border-input bg-background px-3 py-2 min-h-[2.5rem] focus-within:ring-2 focus-within:ring-ring"
          >
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remover tag ${tag}`}
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 rounded-full hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              id="tag-input"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => {
                if (tagInput.trim()) addTag(tagInput)
              }}
              placeholder={tags.length === 0 ? 'Digite e pressione Enter para adicionar...' : ''}
              className="flex-1 min-w-[140px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Adicionar tag"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Pressione Enter ou vírgula para adicionar uma tag.
          </p>
        </div>

        {/* Notas internas */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas internas</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Observações internas sobre este contato..."
                  rows={3}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Ações */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/contacts')}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            aria-busy={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Salvando...' : 'Criar contato'}
          </Button>
        </div>
      </form>
    </Form>
  )
}

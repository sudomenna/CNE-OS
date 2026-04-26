'use client'

/**
 * ContactEditForm — formulário de edição completa de contato.
 * Usa updateContact action; suporta campos básicos + phone primário + email primário + tags + endereço.
 *
 * BR-IDENTITY (estendida) + BR-CONTACT-CLASSIFICATION
 */

import { useCallback, useState, type KeyboardEvent } from 'react'
import { useForm, Controller } from 'react-hook-form'
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

import { updateContact } from '@/app/(app)/contacts/actions'

// ---------------------------------------------------------------------------
// Schema (mesma forma do server, mas tolerante para o form: strings vazias permitidas)
// ---------------------------------------------------------------------------

const formSchema = z.object({
  fullName: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  cpf: z.string().optional().default(''),
  classification: z.enum(['lead', 'customer', 'student', 'mentorado']),
  status: z.enum(['active', 'inactive', 'invalid', 'blocked']),
  origin: z.string().optional().default(''),
  notesSummary: z.string().optional().default(''),
  birthDate: z.string().optional().default(''),
  primaryPhoneE164: z.string().optional().default(''),
  primaryPhoneIsWhatsapp: z.boolean().default(false),
  primaryEmail: z
    .string()
    .optional()
    .default('')
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email inválido'),
  tags: z.array(z.string()).default([]),
  // Endereço
  addrStreet: z.string().optional().default(''),
  addrNumber: z.string().optional().default(''),
  addrComplement: z.string().optional().default(''),
  addrDistrict: z.string().optional().default(''),
  addrCity: z.string().optional().default(''),
  addrState: z.string().optional().default(''),
  addrZip: z.string().optional().default(''),
  addrCountry: z.string().default('BR'),
})

type FormValues = z.input<typeof formSchema>

// ---------------------------------------------------------------------------
// Helpers de máscara
// ---------------------------------------------------------------------------

function applyCpfMask(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function applyPhoneMask(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function applyZipMask(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContactEditFormProps {
  contactId: string
  defaults: {
    fullName: string
    cpf: string | null
    classification: 'lead' | 'customer' | 'student' | 'mentorado'
    status: 'active' | 'inactive' | 'invalid' | 'blocked'
    origin: string | null
    notesSummary: string | null
    birthDate: string | null
    primaryPhone: { e164: string; isWhatsapp: boolean } | null
    primaryEmail: string | null
    tags: string[]
    address: {
      street: string | null
      number: string | null
      complement: string | null
      district: string | null
      city: string | null
      state: string | null
      zip: string | null
      country: string
    } | null
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContactEditForm({ contactId, defaults }: ContactEditFormProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [tagInput, setTagInput] = useState('')

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: defaults.fullName,
      cpf: defaults.cpf ? applyCpfMask(defaults.cpf) : '',
      classification: defaults.classification,
      status: defaults.status,
      origin: defaults.origin ?? '',
      notesSummary: defaults.notesSummary ?? '',
      birthDate: defaults.birthDate ?? '',
      primaryPhoneE164: defaults.primaryPhone?.e164 ?? '',
      primaryPhoneIsWhatsapp: defaults.primaryPhone?.isWhatsapp ?? false,
      primaryEmail: defaults.primaryEmail ?? '',
      tags: defaults.tags,
      addrStreet: defaults.address?.street ?? '',
      addrNumber: defaults.address?.number ?? '',
      addrComplement: defaults.address?.complement ?? '',
      addrDistrict: defaults.address?.district ?? '',
      addrCity: defaults.address?.city ?? '',
      addrState: defaults.address?.state ?? '',
      addrZip: defaults.address?.zip ? applyZipMask(defaults.address.zip) : '',
      addrCountry: defaults.address?.country ?? 'BR',
    },
  })

  const tags = watch('tags')

  const addTag = useCallback(
    (raw: string) => {
      const t = raw.trim().toLowerCase().replace(/\s+/g, '-')
      if (!t) return
      const current = getValues('tags') ?? []
      if (!current.includes(t)) {
        setValue('tags', [...current, t], { shouldDirty: true })
      }
      setTagInput('')
    },
    [getValues, setValue],
  )

  const removeTag = useCallback(
    (t: string) => {
      const current = getValues('tags') ?? []
      setValue('tags', current.filter((x) => x !== t), { shouldDirty: true })
    },
    [getValues, setValue],
  )

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  const onSubmit = async (raw: FormValues) => {
    setSubmitting(true)
    try {
      // Normaliza CPF para 11 dígitos antes de enviar
      const cpfDigits = (raw.cpf ?? '').replace(/\D/g, '')

      const phoneE164 = (raw.primaryPhoneE164 ?? '').trim()
      const primaryPhone = phoneE164
        ? { e164: phoneE164, isWhatsapp: !!raw.primaryPhoneIsWhatsapp }
        : null

      const addressFilled =
        raw.addrStreet || raw.addrNumber || raw.addrComplement ||
        raw.addrDistrict || raw.addrCity || raw.addrState || raw.addrZip

      const result = await updateContact({
        contactId,
        fullName: raw.fullName,
        cpf: cpfDigits || undefined,
        classification: raw.classification,
        status: raw.status,
        origin: raw.origin || null,
        notesSummary: raw.notesSummary || null,
        birthDate: raw.birthDate || null,
        primaryPhone,
        primaryEmail: raw.primaryEmail || null,
        tags: raw.tags ?? [],
        address: addressFilled
          ? {
              street: raw.addrStreet || null,
              number: raw.addrNumber || null,
              complement: raw.addrComplement || null,
              district: raw.addrDistrict || null,
              city: raw.addrCity || null,
              state: raw.addrState || null,
              zip: raw.addrZip || null,
              country: raw.addrCountry || 'BR',
            }
          : null,
      })

      if (!result.ok) {
        toast.error(result.error.message ?? 'Falha ao salvar contato.')
        return
      }
      toast.success('Contato atualizado.')
      router.push(`/contacts/${contactId}`)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" aria-label="Formulário de edição de contato">
      {/* SEÇÃO: Identidade */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">Identidade</h2>
          <p className="text-sm text-muted-foreground">Dados pessoais do contato.</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Nome completo *</Label>
            <Input id="fullName" {...register('fullName')} aria-invalid={!!errors.fullName} />
            {errors.fullName && (
              <p className="text-xs text-destructive">{errors.fullName.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Controller
              control={control}
              name="cpf"
              render={({ field }) => (
                <Input
                  id="cpf"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(applyCpfMask(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="birthDate">Data de nascimento</Label>
            <Input id="birthDate" type="date" {...register('birthDate')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="origin">Origem</Label>
            <Input id="origin" {...register('origin')} placeholder="ex: checkout, indicação, manual" />
          </div>
        </div>
      </section>

      {/* SEÇÃO: Classificação / Status */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">Classificação e status</h2>
          <p className="text-sm text-muted-foreground">
            A classificação é geralmente derivada das transações (BR-CONTACT-CLASSIFICATION). Mudança manual fica em <code>contact_status_history</code>.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="classification">Classificação</Label>
            <Controller
              control={control}
              name="classification"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="classification">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="customer">Cliente</SelectItem>
                    <SelectItem value="student">Aluno</SelectItem>
                    <SelectItem value="mentorado">Mentorado</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                    <SelectItem value="invalid">Inválido</SelectItem>
                    <SelectItem value="blocked">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notesSummary">Resumo de notas</Label>
          <Textarea
            id="notesSummary"
            {...register('notesSummary')}
            rows={3}
            placeholder="Resumo curto visível no header do contato"
          />
        </div>
      </section>

      {/* SEÇÃO: Contato (phone + email) */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">Contato primário</h2>
          <p className="text-sm text-muted-foreground">
            Telefone e e-mail principais. Outros telefones/emails podem ser gerenciados via merge ou import.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="primaryPhoneE164">Telefone (formato livre — será normalizado)</Label>
            <Controller
              control={control}
              name="primaryPhoneE164"
              render={({ field }) => (
                <Input
                  id="primaryPhoneE164"
                  value={field.value ?? ''}
                  onChange={(e) => {
                    // Mantém máscara visual; salva o valor real digitado
                    const masked = applyPhoneMask(e.target.value)
                    field.onChange(masked)
                  }}
                  placeholder="(11) 98765-4321"
                  inputMode="numeric"
                />
              )}
            />
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register('primaryPhoneIsWhatsapp')}
                className="h-4 w-4 rounded border-border"
              />
              <span>Telefone confirmado no WhatsApp</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primaryEmail">E-mail</Label>
            <Input
              id="primaryEmail"
              type="email"
              {...register('primaryEmail')}
              aria-invalid={!!errors.primaryEmail}
              placeholder="contato@exemplo.com"
            />
            {errors.primaryEmail && (
              <p className="text-xs text-destructive">{errors.primaryEmail.message}</p>
            )}
          </div>
        </div>
      </section>

      {/* SEÇÃO: Endereço */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">Endereço</h2>
          <p className="text-sm text-muted-foreground">
            Endereço principal (kind=home). Para BR: CEP 8 dígitos e UF 2 letras.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="addrZip">CEP</Label>
            <Controller
              control={control}
              name="addrZip"
              render={({ field }) => (
                <Input
                  id="addrZip"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(applyZipMask(e.target.value))}
                  placeholder="00000-000"
                  inputMode="numeric"
                />
              )}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addrStreet">Rua / Logradouro</Label>
            <Input id="addrStreet" {...register('addrStreet')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addrNumber">Número</Label>
            <Input id="addrNumber" {...register('addrNumber')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addrComplement">Complemento</Label>
            <Input id="addrComplement" {...register('addrComplement')} placeholder="apto, bloco" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addrDistrict">Bairro</Label>
            <Input id="addrDistrict" {...register('addrDistrict')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addrCity">Cidade</Label>
            <Input id="addrCity" {...register('addrCity')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addrState">UF</Label>
            <Controller
              control={control}
              name="addrState"
              render={({ field }) => (
                <Input
                  id="addrState"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                  maxLength={2}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addrCountry">País</Label>
            <Controller
              control={control}
              name="addrCountry"
              render={({ field }) => (
                <Input
                  id="addrCountry"
                  value={field.value ?? 'BR'}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                />
              )}
            />
          </div>
        </div>
      </section>

      {/* SEÇÃO: Tags */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-3">
        <header>
          <h2 className="text-base font-semibold text-foreground">Tags</h2>
          <p className="text-sm text-muted-foreground">Pressione Enter ou vírgula para adicionar.</p>
        </header>

        <div className="flex flex-wrap gap-1.5">
          {tags?.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Remover tag ${t}`}
                className="ml-0.5 h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={onTagKey}
          placeholder="Nova tag"
        />
      </section>

      {/* AÇÕES */}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/contacts/${contactId}`)}
          disabled={submitting}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  )
}

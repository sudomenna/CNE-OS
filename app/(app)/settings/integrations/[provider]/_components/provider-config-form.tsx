'use client'

/**
 * MOD-CHANNEL / T-15-05 — ProviderConfigForm
 *
 * Client Component: formulário para criar nova channel_account.
 * - select: brand
 * - input: external_id
 * - inputs dinâmicos por provider (definidos em credentialFields)
 *
 * ADR-18: campos de credencial são write-only — nunca exibem valor atual.
 * Acessibilidade AA: labels associados, aria-required, mensagens inline.
 */

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createChannelAccountAction } from '../actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CredentialField = {
  /** Chave do campo no objeto de credenciais. */
  key: string
  /** Label legível para o usuário. */
  label: string
  /** Se verdadeiro, campo é obrigatório no formulário de criação. */
  required: boolean
  /** Placeholder descritivo. */
  placeholder?: string
}

export type BrandOption = {
  id: string
  name: string
}

export interface ProviderConfigFormProps {
  channelKind: 'whatsapp' | 'instagram' | 'email'
  credentialFields: CredentialField[]
  brands: BrandOption[]
  externalIdLabel: string
  externalIdPlaceholder: string | undefined
}

// ---------------------------------------------------------------------------
// ProviderConfigForm
// ---------------------------------------------------------------------------

export function ProviderConfigForm({
  channelKind,
  credentialFields,
  brands,
  externalIdLabel,
  externalIdPlaceholder,
}: ProviderConfigFormProps) {
  const [isPending, startTransition] = useTransition()
  const [brandId, setBrandId] = useState('')
  const [externalId, setExternalId] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    () => Object.fromEntries(credentialFields.map((f) => [f.key, ''])),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!brandId) {
      newErrors.brandId = 'Selecione uma marca'
    }
    if (!externalId.trim()) {
      newErrors.externalId = `${externalIdLabel} é obrigatório`
    }
    credentialFields.forEach((f) => {
      if (f.required && !fieldValues[f.key]?.trim()) {
        newErrors[f.key] = `${f.label} é obrigatório`
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const credentials: Record<string, string> = {}
    credentialFields.forEach((f) => {
      const val = fieldValues[f.key]
      if (val) {
        credentials[f.key] = val
      }
    })

    startTransition(async () => {
      const result = await createChannelAccountAction({
        brandId,
        channelKind,
        externalId: externalId.trim(),
        credentials,
      })

      if (!result.ok) {
        const msg = result.error.message
        if (msg.includes('Já existe uma conta')) {
          setErrors((prev) => ({
            ...prev,
            externalId: msg,
          }))
        } else {
          toast.error(msg)
        }
        return
      }

      toast.success('Conta adicionada com sucesso.')
      // Reset form
      setBrandId('')
      setExternalId('')
      setFieldValues(Object.fromEntries(credentialFields.map((f) => [f.key, ''])))
      setErrors({})
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {errors._form && (
        <p role="alert" className="text-sm text-destructive">
          {errors._form}
        </p>
      )}

      {/* Marca */}
      <div className="space-y-1">
        <Label htmlFor="brand-select">
          Marca
          <span aria-label="obrigatório" className="text-destructive ml-1">*</span>
        </Label>
        <Select
          value={brandId}
          onValueChange={(v) => {
            setBrandId(v)
            setErrors((prev) => { const n = { ...prev }; delete n.brandId; return n })
          }}
        >
          <SelectTrigger
            id="brand-select"
            aria-required="true"
            aria-invalid={!!errors.brandId}
            aria-describedby={errors.brandId ? 'brand-select-err' : undefined}
          >
            <SelectValue placeholder="Selecione uma marca" />
          </SelectTrigger>
          <SelectContent>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.brandId && (
          <p id="brand-select-err" role="alert" className="text-xs text-destructive">
            {errors.brandId}
          </p>
        )}
      </div>

      {/* External ID */}
      <div className="space-y-1">
        <Label htmlFor="external-id-input">
          {externalIdLabel}
          <span aria-label="obrigatório" className="text-destructive ml-1">*</span>
        </Label>
        <Input
          id="external-id-input"
          type="text"
          autoComplete="off"
          placeholder={externalIdPlaceholder ?? externalIdLabel}
          aria-required="true"
          aria-invalid={!!errors.externalId}
          aria-describedby={errors.externalId ? 'external-id-err' : undefined}
          value={externalId}
          onChange={(e) => {
            setExternalId(e.target.value)
            setErrors((prev) => { const n = { ...prev }; delete n.externalId; return n })
          }}
        />
        {errors.externalId && (
          <p id="external-id-err" role="alert" className="text-xs text-destructive">
            {errors.externalId}
          </p>
        )}
      </div>

      {/* Campos dinâmicos de credenciais */}
      {credentialFields.map((field) => (
        <div key={field.key} className="space-y-1">
          <Label htmlFor={`cred-${field.key}`}>
            {field.label}
            {field.required && (
              <span aria-label="obrigatório" className="text-destructive ml-1">*</span>
            )}
          </Label>
          <Input
            id={`cred-${field.key}`}
            type="password"
            autoComplete="off"
            placeholder={field.placeholder ?? field.label}
            aria-required={field.required}
            aria-invalid={!!errors[field.key]}
            aria-describedby={errors[field.key] ? `cred-${field.key}-err` : undefined}
            value={fieldValues[field.key] ?? ''}
            onChange={(e) => {
              setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
              setErrors((prev) => { const n = { ...prev }; delete n[field.key]; return n })
            }}
          />
          {errors[field.key] && (
            <p id={`cred-${field.key}-err`} role="alert" className="text-xs text-destructive">
              {errors[field.key]}
            </p>
          )}
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Campos de token são write-only — os valores não serão exibidos após salvar.
      </p>

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? 'Adicionando…' : 'Adicionar conta'}
      </Button>
    </form>
  )
}

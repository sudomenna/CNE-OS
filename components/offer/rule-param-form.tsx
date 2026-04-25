'use client'

/**
 * RuleParamForm — Form de criação de regra para um grupo de condição.
 *
 * Renderiza campos dinâmicos por `kind` usando os schemas de
 * lib/domain/offer/rule-params-schema.ts como referência visual.
 *
 * Valida params no client (Zod) antes de submeter.
 * Ao submeter → chama createRuleAction(ruleGroupId, kind, params).
 *
 * T-6-19 — spec: docs/20-domain/10-offer-engine.md §3.4, §3.4.1
 */

import * as React from 'react'
import { z } from 'zod'
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
import { createRuleAction } from '@/app/(app)/offers/actions'
import {
  dateRangeParamsSchema,
  salesCountReachedParamsSchema,
  campaignParamsSchema,
  channelParamsSchema,
  creativeParamsSchema,
  internalUseParamsSchema,
  type OfferRuleKind,
} from '@/lib/domain/offer/rule-params-schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RuleKind = OfferRuleKind

interface RuleParamFormProps {
  ruleGroupId: string
  /** Chamado após persistência bem-sucedida */
  onSuccess?: () => void
  /** Chamado ao cancelar */
  onCancel?: () => void
}

// ---------------------------------------------------------------------------
// Kind labels
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<RuleKind, string> = {
  date_range: 'Intervalo de datas',
  sales_count_reached: 'Limite de vendas',
  campaign: 'Campanha',
  channel: 'Canal',
  creative: 'Criativo',
  internal_use: 'Uso interno',
}

const ALL_KINDS: RuleKind[] = [
  'date_range',
  'sales_count_reached',
  'campaign',
  'channel',
  'creative',
  'internal_use',
]

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'email', label: 'E-mail' },
]

// ---------------------------------------------------------------------------
// Param schemas by kind (for client-side validation)
// ---------------------------------------------------------------------------

const paramSchemas: Record<RuleKind, z.ZodTypeAny> = {
  date_range: dateRangeParamsSchema,
  sales_count_reached: salesCountReachedParamsSchema,
  campaign: campaignParamsSchema,
  channel: channelParamsSchema,
  creative: creativeParamsSchema,
  internal_use: internalUseParamsSchema,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RuleParamForm({ ruleGroupId, onSuccess, onCancel }: RuleParamFormProps) {
  const [kind, setKind] = React.useState<RuleKind>('date_range')
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [globalError, setGlobalError] = React.useState<string | null>(null)
  const [isPending, startTransition] = React.useTransition()

  // Per-kind field state
  // date_range
  const [startAt, setStartAt] = React.useState('')
  const [endAt, setEndAt] = React.useState('')
  // sales_count_reached
  const [maxCount, setMaxCount] = React.useState('')
  // campaign
  const [campaignIds, setCampaignIds] = React.useState('')
  // channel (multi-select via checkboxes)
  const [channels, setChannels] = React.useState<string[]>([])
  // creative
  const [creativeIds, setCreativeIds] = React.useState('')
  // internal_use — no fields

  // Reset per-kind fields when kind changes
  React.useEffect(() => {
    setFieldErrors({})
    setGlobalError(null)
  }, [kind])

  function buildParams(): Record<string, unknown> {
    switch (kind) {
      case 'date_range':
        return { start_at: startAt, end_at: endAt }
      case 'sales_count_reached':
        return { max: maxCount === '' ? undefined : Number(maxCount) }
      case 'campaign':
        return {
          campaign_ids: campaignIds
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }
      case 'channel':
        return { channels }
      case 'creative':
        return {
          creative_ids: creativeIds
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }
      case 'internal_use':
        return {}
    }
  }

  function validate(params: Record<string, unknown>): boolean {
    const schema = paramSchemas[kind]
    const result = schema.safeParse(params)
    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_root'
        errors[key] = issue.message
      }
      setFieldErrors(errors)
      return false
    }
    setFieldErrors({})
    return true
  }

  function handleChannelToggle(value: string) {
    setChannels((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = buildParams()
    if (!validate(params)) return

    setGlobalError(null)
    startTransition(async () => {
      const result = await createRuleAction({ ruleGroupId, kind, params })
      if (!result.ok) {
        setGlobalError(result.error.message)
        return
      }
      onSuccess?.()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="Criar regra">
      {/* Kind selector */}
      <div className="space-y-1.5">
        <Label htmlFor="rule-kind">Tipo de regra</Label>
        <Select
          value={kind}
          onValueChange={(v) => setKind(v as RuleKind)}
        >
          <SelectTrigger id="rule-kind" className="w-full">
            <SelectValue placeholder="Selecione o tipo" />
          </SelectTrigger>
          <SelectContent>
            {ALL_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dynamic fields per kind */}
      {kind === 'date_range' && (
        <fieldset className="space-y-3 border rounded-md p-3">
          <legend className="text-xs font-medium px-1 text-muted-foreground">Intervalo de datas</legend>
          <div className="space-y-1.5">
            <Label htmlFor="start_at">Início (ISO 8601)</Label>
            <Input
              id="start_at"
              type="datetime-local"
              value={startAt ? startAt.replace('Z', '') : ''}
              onChange={(e) => setStartAt(e.target.value ? `${e.target.value}:00.000Z` : '')}
              aria-describedby={fieldErrors['start_at'] ? 'err-start_at' : undefined}
              aria-invalid={!!fieldErrors['start_at']}
            />
            {fieldErrors['start_at'] && (
              <p id="err-start_at" role="alert" className="text-xs text-red-500">
                {fieldErrors['start_at']}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end_at">Fim (ISO 8601)</Label>
            <Input
              id="end_at"
              type="datetime-local"
              value={endAt ? endAt.replace('Z', '') : ''}
              onChange={(e) => setEndAt(e.target.value ? `${e.target.value}:00.000Z` : '')}
              aria-describedby={fieldErrors['end_at'] ? 'err-end_at' : undefined}
              aria-invalid={!!fieldErrors['end_at']}
            />
            {fieldErrors['end_at'] && (
              <p id="err-end_at" role="alert" className="text-xs text-red-500">
                {fieldErrors['end_at']}
              </p>
            )}
          </div>
        </fieldset>
      )}

      {kind === 'sales_count_reached' && (
        <fieldset className="space-y-3 border rounded-md p-3">
          <legend className="text-xs font-medium px-1 text-muted-foreground">Limite de vendas</legend>
          <div className="space-y-1.5">
            <Label htmlFor="max_count">Máximo de aprovações</Label>
            <Input
              id="max_count"
              type="number"
              min={1}
              step={1}
              placeholder="ex: 100"
              value={maxCount}
              onChange={(e) => setMaxCount(e.target.value)}
              aria-describedby={fieldErrors['max'] ? 'err-max' : undefined}
              aria-invalid={!!fieldErrors['max']}
            />
            {fieldErrors['max'] && (
              <p id="err-max" role="alert" className="text-xs text-red-500">
                {fieldErrors['max']}
              </p>
            )}
            <p className="text-xs text-muted-foreground/60">
              Elegível enquanto aprovações &lt; máximo. Pode exceder por concorrência (ADR-07).
            </p>
          </div>
        </fieldset>
      )}

      {kind === 'campaign' && (
        <fieldset className="space-y-3 border rounded-md p-3">
          <legend className="text-xs font-medium px-1 text-muted-foreground">Campanha</legend>
          <div className="space-y-1.5">
            <Label htmlFor="campaign_ids">UUIDs das campanhas (um por linha)</Label>
            <textarea
              id="campaign_ids"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="3fa85f64-5717-4562-b3fc-2c963f66afa6&#10;..."
              value={campaignIds}
              onChange={(e) => setCampaignIds(e.target.value)}
              aria-describedby={fieldErrors['campaign_ids'] ? 'err-campaign_ids' : undefined}
              aria-invalid={!!fieldErrors['campaign_ids']}
            />
            {fieldErrors['campaign_ids'] && (
              <p id="err-campaign_ids" role="alert" className="text-xs text-red-500">
                {fieldErrors['campaign_ids']}
              </p>
            )}
          </div>
        </fieldset>
      )}

      {kind === 'channel' && (
        <fieldset className="space-y-3 border rounded-md p-3">
          <legend className="text-xs font-medium px-1 text-muted-foreground">Canal</legend>
          <div className="space-y-2" role="group" aria-label="Canais elegíveis">
            {CHANNEL_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  value={opt.value}
                  checked={channels.includes(opt.value)}
                  onChange={() => handleChannelToggle(opt.value)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
          {fieldErrors['channels'] && (
            <p role="alert" className="text-xs text-red-500">
              {fieldErrors['channels']}
            </p>
          )}
        </fieldset>
      )}

      {kind === 'creative' && (
        <fieldset className="space-y-3 border rounded-md p-3">
          <legend className="text-xs font-medium px-1 text-muted-foreground">Criativo</legend>
          <div className="space-y-1.5">
            <Label htmlFor="creative_ids">UUIDs dos criativos (um por linha)</Label>
            <textarea
              id="creative_ids"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="3fa85f64-5717-4562-b3fc-2c963f66afa6&#10;..."
              value={creativeIds}
              onChange={(e) => setCreativeIds(e.target.value)}
              aria-describedby={fieldErrors['creative_ids'] ? 'err-creative_ids' : undefined}
              aria-invalid={!!fieldErrors['creative_ids']}
            />
            {fieldErrors['creative_ids'] && (
              <p id="err-creative_ids" role="alert" className="text-xs text-red-500">
                {fieldErrors['creative_ids']}
              </p>
            )}
          </div>
        </fieldset>
      )}

      {kind === 'internal_use' && (
        <div className="rounded-md bg-muted/50 border border-border p-3 text-sm text-muted-foreground">
          Sem parâmetros adicionais. Elegível apenas quando a venda for marcada como uso interno.
        </div>
      )}

      {/* Global error */}
      {globalError && (
        <p role="alert" className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          {globalError}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Criar regra'}
        </Button>
      </div>
    </form>
  )
}

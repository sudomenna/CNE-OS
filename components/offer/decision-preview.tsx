'use client'

/**
 * DecisionPreview — formulário de simulação de decisão de oferta.
 *
 * Dado um DecisionContext, chama simulateDecisionAction e exibe:
 *   - Resultado da decisão (badge + condição vencedora ou lista de conflito)
 *   - Tabela de avaliação por condição (nome | elegível | prioridade | score)
 *
 * T-6-21 — spec: docs/20-domain/10-offer-engine.md §11
 * BR-OFFER-DECISION, BR-OFFER-ELIGIBILITY
 */

import * as React from 'react'
import { useTransition, useState } from 'react'

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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

import { simulateDecisionAction } from '@/app/(app)/offers/[id]/preview/actions'
import type { SimulateResult, EvaluatedCondition } from '@/app/(app)/offers/[id]/preview/actions'
import type { SelectConditionResult } from '@/lib/domain/offer'

// ---------------------------------------------------------------------------
// Helpers para badge de resultado
// ---------------------------------------------------------------------------

type ResultBadgeProps = {
  result: SelectConditionResult
}

function ResultBadge({ result }: ResultBadgeProps) {
  const config = {
    selected: {
      label: 'Condição selecionada',
      className: 'bg-green-100 text-green-800 border-green-200',
    },
    default: {
      label: 'Fallback (default)',
      className: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    conflict: {
      label: 'Conflito',
      className: 'bg-orange-100 text-orange-800 border-orange-200',
    },
    none: {
      label: 'Sem condição elegível',
      className: 'bg-muted text-muted-foreground border-border',
    },
  }

  const { label, className } = config[result.kind]

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${className}`}
      role="status"
      aria-label={`Resultado da simulação: ${label}`}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tabela de avaliação
// ---------------------------------------------------------------------------

function EvaluationTable({ rows }: { rows: EvaluatedCondition[] }) {
  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm" role="table" aria-label="Avaliação de condições">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th
              scope="col"
              className="px-4 py-2.5 text-left font-medium text-muted-foreground"
            >
              Condição
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left font-medium text-muted-foreground"
            >
              Elegível
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left font-medium text-muted-foreground"
            >
              Prioridade
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left font-medium text-muted-foreground"
            >
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.conditionId}
              className="border-b border-border last:border-0 hover:bg-muted/50"
            >
              <td className="px-4 py-2.5 text-foreground">
                <span className="font-medium">{row.conditionName}</span>
                {row.isDefault && (
                  <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 font-medium">
                    default
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {row.eligible ? (
                  <span
                    className="text-green-600 font-semibold"
                    aria-label="Condição elegível"
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    className="text-red-400"
                    aria-label="Condição não elegível"
                  >
                    ✗
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                {row.priority}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                {row.advantageScore.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

type Props = {
  offerId: string
}

type FormState = {
  contactId: string
  channel: string
  campaignId: string
  creativeId: string
  salesCount: string
  isInternalUse: boolean
}

const INITIAL_FORM: FormState = {
  contactId: '',
  channel: '',
  campaignId: '',
  creativeId: '',
  salesCount: '',
  isInternalUse: false,
}

export function DecisionPreview({ offerId }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [simulateResult, setSimulateResult] = useState<SimulateResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(field: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage(null)
    setSimulateResult(null)

    // exactOptionalPropertyTypes: só incluir campos definidos
    const contactIdVal = form.contactId.trim()
    const channelVal = form.channel
    const campaignIdVal = form.campaignId.trim()
    const creativeIdVal = form.creativeId.trim()
    const salesCountVal = form.salesCount ? parseInt(form.salesCount, 10) : undefined

    const ctx: Parameters<typeof simulateDecisionAction>[1] = {
      ...(contactIdVal ? { contactId: contactIdVal } : {}),
      ...(channelVal ? { channel: channelVal } : {}),
      ...(campaignIdVal ? { campaignId: campaignIdVal } : {}),
      ...(creativeIdVal ? { creativeId: creativeIdVal } : {}),
      ...(salesCountVal !== undefined ? { salesCount: salesCountVal } : {}),
      isInternalUse: form.isInternalUse,
    }

    startTransition(async () => {
      const result = await simulateDecisionAction(offerId, ctx)
      if (!result.ok) {
        setErrorMessage(result.error.message)
        return
      }
      setSimulateResult(result.data)
    })
  }

  const winnerConditionId =
    simulateResult?.result.kind === 'selected' || simulateResult?.result.kind === 'default'
      ? simulateResult.result.conditionId
      : null

  const conflictIds =
    simulateResult?.result.kind === 'conflict'
      ? simulateResult.result.conditionIds
      : []

  return (
    <div className="space-y-6">
      {/* Formulário de contexto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contexto da decisão</CardTitle>
          <CardDescription>
            Preencha os campos para simular qual condição seria selecionada neste contexto.
            Campos em branco são ignorados na avaliação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            aria-label="Formulário de simulação de decisão"
            className="grid gap-4 sm:grid-cols-2"
          >
            {/* contactId */}
            <div className="space-y-1.5">
              <Label htmlFor="sim-contactId">ID do Contato (UUID)</Label>
              <Input
                id="sim-contactId"
                placeholder="ex: 3f8b..."
                value={form.contactId}
                onChange={(e) => handleChange('contactId', e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* channel */}
            <div className="space-y-1.5">
              <Label htmlFor="sim-channel">Canal</Label>
              <Select
                value={form.channel}
                onValueChange={(v) => handleChange('channel', v)}
              >
                <SelectTrigger id="sim-channel" aria-label="Selecione o canal">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* campaignId */}
            <div className="space-y-1.5">
              <Label htmlFor="sim-campaignId">ID da Campanha (UUID)</Label>
              <Input
                id="sim-campaignId"
                placeholder="ex: a1b2..."
                value={form.campaignId}
                onChange={(e) => handleChange('campaignId', e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* creativeId */}
            <div className="space-y-1.5">
              <Label htmlFor="sim-creativeId">ID do Criativo (UUID)</Label>
              <Input
                id="sim-creativeId"
                placeholder="ex: c3d4..."
                value={form.creativeId}
                onChange={(e) => handleChange('creativeId', e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* salesCount */}
            <div className="space-y-1.5">
              <Label htmlFor="sim-salesCount">Contador de Vendas Aprovadas</Label>
              <Input
                id="sim-salesCount"
                type="number"
                min={0}
                placeholder="ex: 10"
                value={form.salesCount}
                onChange={(e) => handleChange('salesCount', e.target.value)}
              />
            </div>

            {/* isInternalUse */}
            <div className="space-y-1.5">
              <Label htmlFor="sim-internalUse">Uso Interno do Comercial</Label>
              <Select
                value={form.isInternalUse ? 'true' : 'false'}
                onValueChange={(v) => handleChange('isInternalUse', v === 'true')}
              >
                <SelectTrigger id="sim-internalUse" aria-label="Uso interno">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Não</SelectItem>
                  <SelectItem value="true">Sim (interno)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Submit */}
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={isPending} aria-busy={isPending}>
                {isPending ? 'Simulando...' : 'Simular'}
              </Button>
            </div>

            {/* Erro de Server Action */}
            {errorMessage && (
              <div
                role="alert"
                aria-live="assertive"
                className="sm:col-span-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {errorMessage}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Resultado */}
      {simulateResult && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <CardTitle className="text-base">Resultado da simulação</CardTitle>
            <ResultBadge result={simulateResult.result} />
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Condição vencedora */}
            {winnerConditionId && (
              <div
                className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm"
                aria-label="Condição vencedora"
              >
                <p className="font-medium text-green-800">
                  Condição selecionada:{' '}
                  <span className="font-mono">
                    {simulateResult.evaluated.find(
                      (e) => e.conditionId === winnerConditionId,
                    )?.conditionName ?? winnerConditionId}
                  </span>
                </p>
                {simulateResult.result.kind === 'default' && (
                  <p className="mt-1 text-green-700 text-xs">
                    Nenhuma condição elegível encontrada — condição padrão aplicada como fallback.
                  </p>
                )}
              </div>
            )}

            {/* Conflito */}
            {conflictIds.length > 0 && (
              <div
                className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm"
                role="alert"
                aria-label="Conflito entre condições"
              >
                <p className="font-medium text-orange-800 mb-2">
                  Conflito: {conflictIds.length} condições empatadas em prioridade + score +
                  timestamp.
                </p>
                <ul className="space-y-1 text-orange-700 text-xs list-disc list-inside">
                  {conflictIds.map((id) => (
                    <li key={id}>
                      <span className="font-mono">{id}</span>
                      {' — '}
                      {simulateResult.evaluated.find((e) => e.conditionId === id)
                        ?.conditionName ?? ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Nenhuma elegível */}
            {simulateResult.result.kind === 'none' && (
              <div
                className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
                role="status"
              >
                Nenhuma condição elegível encontrada e nenhuma condição default configurada.
                Verifique a configuração da oferta.
              </div>
            )}

            {/* Tabela de avaliação */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Avaliação por condição
              </h3>
              <EvaluationTable rows={simulateResult.evaluated} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

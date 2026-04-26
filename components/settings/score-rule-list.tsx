'use client'

/**
 * ScoreRuleList — lista e gerencia regras de score de um funil
 *
 * Funcionalidades:
 * - Lista regras existentes com event_kind, delta e toggle ativo/inativo.
 * - Form inline para adicionar nova regra.
 * - Edição inline (toggle isActive + exclusão).
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md §3 (funnel_score_rule)
 * Roadmap: T-12-24
 */

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  createScoreRuleAction,
  updateScoreRuleAction,
  deleteScoreRuleAction,
} from '@/app/(app)/settings/funnels/actions'
import type { FunnelScoreRule } from '@/lib/db/schema/funnel'

// ---------------------------------------------------------------------------
// Schema para o form inline de criação
// ---------------------------------------------------------------------------

const createRuleFormSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  eventKind: z.string().min(1, 'Evento é obrigatório').max(200),
  delta: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, 'Delta deve ser um número')
    .refine((v) => Number(v) !== 0, 'Delta não pode ser zero'),
})

type CreateRuleFormValues = z.infer<typeof createRuleFormSchema>

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ScoreRuleListProps {
  funnelId: string
  initialRules: FunnelScoreRule[]
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function ScoreRuleList({ funnelId, initialRules }: ScoreRuleListProps) {
  const [rules, setRules] = useState<FunnelScoreRule[]>(initialRules)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<CreateRuleFormValues>({
    resolver: zodResolver(createRuleFormSchema),
    defaultValues: { name: '', eventKind: '', delta: '' },
  })

  function handleCreate(values: CreateRuleFormValues) {
    startTransition(async () => {
      const result = await createScoreRuleAction({
        funnelId,
        name: values.name,
        eventKind: values.eventKind,
        delta: Number(values.delta),
        isActive: true,
      })

      if (result.ok) {
        setRules((prev) => [...prev, result.data])
        form.reset({ name: '', eventKind: '', delta: '' })
        setShowForm(false)
        toast.success('Regra de score criada.')
      } else {
        const msg = result.error.issues?.[0]?.message ?? result.error.message
        toast.error('Erro ao criar regra', { description: msg })
      }
    })
  }

  function handleToggle(rule: FunnelScoreRule) {
    startTransition(async () => {
      const result = await updateScoreRuleAction({
        id: rule.id,
        isActive: !rule.isActive,
      })

      if (result.ok) {
        setRules((prev) => prev.map((r) => (r.id === result.data.id ? result.data : r)))
      } else {
        toast.error('Erro ao atualizar regra', { description: result.error.message })
      }
    })
  }

  function handleDelete(ruleId: string) {
    if (!confirm('Remover esta regra de score? Esta ação não pode ser desfeita.')) return

    startTransition(async () => {
      const result = await deleteScoreRuleAction({ id: ruleId })

      if (result.ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId))
        toast.success('Regra removida.')
      } else {
        toast.error('Erro ao remover regra', { description: result.error.message })
      }
    })
  }

  return (
    <section aria-labelledby="score-rules-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3
          id="score-rules-heading"
          className="text-sm font-medium text-foreground"
        >
          Regras de score
        </h3>
        {!showForm && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
            disabled={isPending}
          >
            <Plus className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Adicionar regra
          </Button>
        )}
      </div>

      {/* Lista de regras existentes */}
      {rules.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma regra de score configurada. Adicione uma regra para pontuar oportunidades
          automaticamente conforme eventos ocorrem.
        </p>
      ) : (
        <div
          role="list"
          aria-label="Regras de score"
          className="divide-y divide-border rounded-lg border border-border"
        >
          {rules.map((rule) => (
            <div
              key={rule.id}
              role="listitem"
              className="flex items-center gap-3 px-4 py-3"
            >
              {/* Toggle ativo/inativo */}
              <Switch
                checked={rule.isActive}
                onCheckedChange={() => handleToggle(rule)}
                disabled={isPending}
                aria-label={`${rule.isActive ? 'Desativar' : 'Ativar'} regra "${rule.name}"`}
              />

              {/* Detalhes */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {rule.eventKind}
                </p>
              </div>

              {/* Delta */}
              <Badge
                variant={Number(rule.delta) >= 0 ? 'default' : 'destructive'}
                className="shrink-0 font-mono"
                aria-label={`Delta: ${Number(rule.delta) >= 0 ? '+' : ''}${rule.delta} pontos`}
              >
                {Number(rule.delta) >= 0 ? '+' : ''}
                {rule.delta}
              </Badge>

              {/* Status */}
              {!rule.isActive && (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  Inativa
                </Badge>
              )}

              {/* Remover */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => handleDelete(rule.id)}
                disabled={isPending}
                aria-label={`Remover regra "${rule.name}"`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Form inline de criação */}
      {showForm && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
          <p className="text-sm font-medium text-foreground">Nova regra de score</p>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleCreate)}
              className="space-y-3"
              aria-label="Nova regra de score"
              noValidate
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex: Mensagem recebida"
                        disabled={isPending}
                        aria-required="true"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="eventKind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Evento (event_kind)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex: message_inbound"
                        disabled={isPending}
                        aria-required="true"
                        className="font-mono text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="delta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delta (pontos)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        placeholder="Ex: 10 ou -5"
                        disabled={isPending}
                        aria-required="true"
                        step="any"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowForm(false)
                    form.reset()
                  }}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={isPending} aria-busy={isPending}>
                  {isPending ? 'Salvando…' : 'Criar regra'}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}
    </section>
  )
}

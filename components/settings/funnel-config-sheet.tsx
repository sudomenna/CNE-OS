'use client'

/**
 * FunnelConfigSheet — Sheet de configuração de funil (nome, estágios, score rules)
 *
 * Carrega dados lazily ao abrir o Sheet.
 * Renderiza FunnelConfigForm (estágios) + ScoreRuleList na mesma Sheet.
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md
 * Roadmap: T-12-24
 */

import { useState, useTransition } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, X } from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { ScoreRuleList } from './score-rule-list'
import {
  getFunnelWithStages,
  listScoreRulesAction,
  updateFunnelAction,
} from '@/app/(app)/settings/funnels/actions'
import type { FunnelWithStages } from '@/app/(app)/settings/funnels/actions'
import type { FunnelScoreRule } from '@/lib/db/schema/funnel'

// ---------------------------------------------------------------------------
// Schema Zod para o form de edição
// ---------------------------------------------------------------------------

const stageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Nome do estágio é obrigatório').max(200),
  position: z.number().int().nonnegative(),
  isTerminal: z.boolean(),
})

const funnelFormSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(200),
  stages: z.array(stageSchema).min(1, 'Funil deve ter pelo menos 1 estágio'),
})

type FunnelFormValues = z.infer<typeof funnelFormSchema>

// ---------------------------------------------------------------------------
// FunnelConfigSheet — props
// ---------------------------------------------------------------------------

export interface FunnelConfigSheetProps {
  funnelId: string
  funnelName: string
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function FunnelConfigSheet({ funnelId, funnelName }: FunnelConfigSheetProps) {
  const [open, setOpen] = useState(false)
  const [loadingData, startLoadingData] = useTransition()
  const [funnelData, setFunnelData] = useState<FunnelWithStages | null>(null)
  const [scoreRules, setScoreRules] = useState<FunnelScoreRule[]>([])

  function handleOpenChange(next: boolean) {
    setOpen(next)

    if (next && funnelData === null) {
      startLoadingData(async () => {
        const [funnelResult, rulesResult] = await Promise.all([
          getFunnelWithStages(funnelId),
          listScoreRulesAction(funnelId),
        ])

        if (!funnelResult.ok) {
          toast.error('Erro ao carregar funil', { description: funnelResult.error.message })
          setOpen(false)
          return
        }

        setFunnelData(funnelResult.data)
        setScoreRules(rulesResult.ok ? rulesResult.data : [])
      })
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Editar funil ${funnelName}`}
        >
          <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Editar
        </Button>
      </SheetTrigger>

      <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Configurar funil</SheetTitle>
          <SheetDescription>
            Edite nome, estágios e regras de pontuação de{' '}
            <strong>{funnelName}</strong>.
          </SheetDescription>
        </SheetHeader>

        {loadingData && (
          <div
            className="flex items-center justify-center py-16"
            aria-busy="true"
            aria-label="Carregando configurações do funil"
          >
            <Loader2
              className="h-6 w-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        )}

        {!loadingData && funnelData && (
          <div className="py-4 space-y-8">
            <FunnelEditForm
              funnel={funnelData}
              onSuccess={() => setOpen(false)}
            />

            <Separator />

            <ScoreRuleList funnelId={funnelId} initialRules={scoreRules} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// FunnelEditForm — form de nome + estágios (embutido na Sheet)
// ---------------------------------------------------------------------------

interface FunnelEditFormProps {
  funnel: FunnelWithStages
  onSuccess: () => void
}

function FunnelEditForm({ funnel, onSuccess }: FunnelEditFormProps) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<FunnelFormValues>({
    resolver: zodResolver(funnelFormSchema),
    defaultValues: {
      name: funnel.name,
      stages: funnel.stages.map((s, i) => ({
        id: s.id,
        name: s.name,
        position: i,
        isTerminal: s.isTerminal,
      })),
    },
  })

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'stages',
  })

  function onSubmit(values: FunnelFormValues) {
    startTransition(async () => {
      const stagesWithPosition = values.stages.map((s, i) => ({ ...s, position: i }))

      const result = await updateFunnelAction({
        id: funnel.id,
        name: values.name,
        stages: stagesWithPosition,
      })

      if (result.ok) {
        toast.success('Funil atualizado com sucesso!')
        onSuccess()
      } else {
        const msg = result.error.issues?.[0]?.message ?? result.error.message
        toast.error('Erro ao salvar funil', { description: msg })
      }
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        aria-label={`Editar funil ${funnel.name}`}
        noValidate
      >
        {/* Nome */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do funil</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Ex: Matrícula 2026"
                  disabled={isPending}
                  aria-required="true"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Estágios */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium leading-none text-foreground">
            Estágios
          </legend>

          <div className="space-y-2" role="list" aria-label="Lista de estágios">
            {fields.map((field, index) => (
              <FormField
                key={field.id}
                control={form.control}
                name={`stages.${index}.name`}
                render={({ field: inputField }) => (
                  <FormItem role="listitem">
                    <div className="flex items-center gap-1">
                      {/* Reordenação ↑↓ */}
                      <div className="flex flex-col shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          onClick={() => move(index, index - 1)}
                          disabled={isPending || index === 0}
                          aria-label={`Mover estágio ${index + 1} para cima`}
                        >
                          <ChevronUp className="h-3 w-3" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          onClick={() => move(index, index + 1)}
                          disabled={isPending || index === fields.length - 1}
                          aria-label={`Mover estágio ${index + 1} para baixo`}
                        >
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>

                      <span className="text-xs text-muted-foreground w-5 text-center shrink-0">
                        {index + 1}
                      </span>

                      <FormControl>
                        <Input
                          {...inputField}
                          placeholder={`Estágio ${index + 1}`}
                          disabled={isPending}
                          aria-label={`Nome do estágio ${index + 1}`}
                        />
                      </FormControl>

                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          disabled={isPending}
                          aria-label={`Remover estágio ${index + 1}`}
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>

          {typeof form.formState.errors.stages?.message === 'string' && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {form.formState.errors.stages.message}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              append({ id: undefined, name: '', position: fields.length, isTerminal: false })
            }
            disabled={isPending}
          >
            <Plus className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Adicionar estágio
          </Button>
        </fieldset>

        <SheetFooter>
          <Button type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </SheetFooter>
      </form>
    </Form>
  )
}

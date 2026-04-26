'use client'

/**
 * CreateFunnelDialog — Dialog "Criar funil" com react-hook-form + zod
 *
 * Campos: nome, marca (select), estágios iniciais (lista dinâmica).
 * Após sucesso: fecha e redireciona para /funnels/{id}.
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md
 * Roadmap: T-12-21
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createFunnelAction } from '@/app/(app)/funnels/actions'

// ---------------------------------------------------------------------------
// Schema Zod
// ---------------------------------------------------------------------------

const createFunnelFormSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  brandId: z.string().uuid('Selecione uma marca válida'),
  stages: z
    .array(z.object({ value: z.string().min(1, 'Nome do estágio é obrigatório') }))
    .min(1, 'Mínimo 1 estágio obrigatório'),
})

type CreateFunnelFormValues = z.infer<typeof createFunnelFormSchema>

const DEFAULT_STAGES = [
  { value: 'Novo lead' },
  { value: 'Em negociação' },
  { value: 'Proposta enviada' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CreateFunnelDialogProps {
  brands: { id: string; name: string }[]
  trigger?: React.ReactNode
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function CreateFunnelDialog({ brands, trigger }: CreateFunnelDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<CreateFunnelFormValues>({
    resolver: zodResolver(createFunnelFormSchema),
    defaultValues: {
      name: '',
      brandId: '',
      stages: DEFAULT_STAGES,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'stages',
  })

  function handleOpenChange(next: boolean) {
    if (isPending) return
    setOpen(next)
    if (!next) {
      form.reset({ name: '', brandId: '', stages: DEFAULT_STAGES })
    }
  }

  function onSubmit(values: CreateFunnelFormValues) {
    startTransition(async () => {
      const result = await createFunnelAction({
        name: values.name,
        brandId: values.brandId,
        stages: values.stages.map((s) => s.value),
      })

      if (result.ok) {
        toast.success('Funil criado com sucesso!')
        setOpen(false)
        form.reset({ name: '', brandId: '', stages: DEFAULT_STAGES })
        router.push(`/funnels/${result.data.funnelId}`)
      } else {
        const msg = result.error.issues?.[0]?.message ?? result.error.message
        toast.error('Erro ao criar funil', { description: msg })
      }
    })
  }

  const defaultTrigger = (
    <Button aria-label="Abrir dialog de criação de funil">
      <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
      Criar funil
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar funil</DialogTitle>
          <DialogDescription>
            Preencha os dados e defina os estágios iniciais do funil.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-5 py-2"
            aria-label="Criar funil"
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

            {/* Marca */}
            <FormField
              control={form.control}
              name="brandId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Selecionar marca">
                        <SelectValue placeholder="Selecione uma marca" />
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

            {/* Estágios */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium leading-none text-foreground">
                Estágios iniciais
              </legend>

              <div className="space-y-2" role="list" aria-label="Lista de estágios">
                {fields.map((field, index) => (
                  <FormField
                    key={field.id}
                    control={form.control}
                    name={`stages.${index}.value`}
                    render={({ field: inputField }) => (
                      <FormItem role="listitem">
                        <div className="flex items-center gap-2">
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

              {/* Erro de array (ex: mínimo 1) */}
              {form.formState.errors.stages?.root && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {form.formState.errors.stages.root.message}
                </p>
              )}
              {form.formState.errors.stages?.message && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {form.formState.errors.stages.message}
                </p>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ value: '' })}
                disabled={isPending}
                className="mt-1"
              >
                <Plus className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Adicionar estágio
              </Button>
            </fieldset>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} aria-busy={isPending}>
                {isPending ? 'Criando…' : 'Criar funil'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

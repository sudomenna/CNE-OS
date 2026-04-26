'use client'

/**
 * FunnelListClient — lista de funis + Dialog "Novo Funil"
 *
 * Client Component: gerencia estado do Dialog e chama createFunnelAction.
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md
 * Roadmap: T-5-13
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFunnelAction } from '@/app/(app)/funnels/actions'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type FunnelListItem = {
  id: string
  name: string
  slug: string
  brandId: string
  isActive: boolean
  createdAt: Date
  stageCount: number | bigint
  entryCount: number | bigint
}

interface FunnelListClientProps {
  funnels: FunnelListItem[]
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function FunnelListClient({ funnels }: FunnelListClientProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Campos do form
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [brandId, setBrandId] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  // Auto-gera slug a partir do nome
  function handleNameChange(value: string) {
    setName(value)
    const autoSlug = value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    setSlug(autoSlug)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFieldError(null)

    if (!name.trim()) {
      setFieldError('Nome é obrigatório.')
      return
    }
    if (!slug.trim()) {
      setFieldError('Slug é obrigatório.')
      return
    }
    if (!brandId.trim()) {
      setFieldError('Brand ID é obrigatório.')
      return
    }

    startTransition(async () => {
      const result = await createFunnelAction({ name, brandId, stages: ['Novo lead', 'Em negociação', 'Proposta enviada'] })
      if (result.ok) {
        toast.success('Funil criado com sucesso!')
        setOpen(false)
        setName('')
        setSlug('')
        setBrandId('')
      } else {
        const msg = result.error.issues?.[0]?.message ?? result.error.message
        setFieldError(msg)
        toast.error('Erro ao criar funil', { description: msg })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Botão Novo Funil */}
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button aria-label="Criar novo funil">+ Novo Funil</Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Funil</DialogTitle>
              <DialogDescription>
                Preencha os dados básicos. Os estágios padrão serão criados automaticamente.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 py-2" aria-label="Criar funil">
              {/* Nome */}
              <div className="space-y-1.5">
                <Label htmlFor="funnel-name">Nome</Label>
                <Input
                  id="funnel-name"
                  placeholder="Ex: Matrícula 2026"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  disabled={isPending}
                  required
                  aria-required="true"
                />
              </div>

              {/* Slug */}
              <div className="space-y-1.5">
                <Label htmlFor="funnel-slug">
                  Slug{' '}
                  <span className="text-muted-foreground/60 text-xs font-normal">(auto-gerado do nome)</span>
                </Label>
                <Input
                  id="funnel-slug"
                  placeholder="matricula-2026"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={isPending}
                  pattern="[a-z0-9-]+"
                  aria-describedby="slug-hint"
                  required
                />
                <p id="slug-hint" className="text-xs text-muted-foreground/60">
                  Apenas letras minúsculas, números e hífens.
                </p>
              </div>

              {/* Brand ID */}
              <div className="space-y-1.5">
                <Label htmlFor="funnel-brand-id">Brand ID</Label>
                <Input
                  id="funnel-brand-id"
                  placeholder="UUID da marca"
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  disabled={isPending}
                  required
                  aria-required="true"
                />
              </div>

              {/* Erro de campo */}
              {fieldError && (
                <p role="alert" className="text-sm text-red-600">
                  {fieldError}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending} aria-busy={isPending}>
                  {isPending ? 'Criando…' : 'Criar Funil'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista de funis */}
      {funnels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/60">
          <p className="text-base">Nenhum funil cadastrado.</p>
          <p className="text-sm mt-1">Crie o primeiro funil para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {funnels.map((f) => (
            <Link key={f.id} href={`/funnels/${f.id}`} className="group block">
              <Card className="transition-shadow hover:shadow-md h-full cursor-pointer border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold text-foreground group-hover:text-blue-600 transition-colors leading-snug">
                      {f.name}
                    </CardTitle>
                    {!f.isActive && (
                      <span className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5 shrink-0">
                        Inativo
                      </span>
                    )}
                  </div>
                  <CardDescription className="text-xs text-muted-foreground/60 font-mono">
                    /{f.slug}
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <div className="flex flex-col">
                      <span className="text-lg font-semibold text-foreground tabular-nums leading-none">
                        {Number(f.stageCount)}
                      </span>
                      <span className="text-xs text-muted-foreground/60 mt-0.5">
                        {Number(f.stageCount) === 1 ? 'estágio' : 'estágios'}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-lg font-semibold text-foreground tabular-nums leading-none">
                        {Number(f.entryCount)}
                      </span>
                      <span className="text-xs text-muted-foreground/60 mt-0.5">
                        {Number(f.entryCount) === 1
                          ? 'oportunidade ativa'
                          : 'oportunidades ativas'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

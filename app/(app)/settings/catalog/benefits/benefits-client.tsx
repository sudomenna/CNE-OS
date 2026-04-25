'use client'

/**
 * BenefitsClient — componente Client para criar e arquivar benefícios comerciais.
 * Inlined na página de benefícios (sem components/catalog/).
 * Spec: T-6-04
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createBenefitAction, archiveBenefitAction } from './actions'

type Brand = { id: string; name: string; slug: string }

type Props =
  | { mode: 'create-only'; brands: Brand[]; benefitId?: never; benefitName?: never }
  | { mode: 'archive-only'; brands: Brand[]; benefitId: string; benefitName: string }

export function BenefitsClient({ mode, brands, benefitId, benefitName }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- Create benefit form ----
  if (mode === 'create-only') {
    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault()
      setLoading(true)
      setError(null)

      const form = new FormData(e.currentTarget)
      const autoTag = form.get('autoTag') as string | null
      const durationStr = form.get('defaultDurationMonths') as string | null

      const result = await createBenefitAction({
        brandId: form.get('brandId'),
        name: form.get('name'),
        slug: form.get('slug'),
        description: form.get('description') || null,
        autoTag: autoTag && autoTag.trim() !== '' ? autoTag.trim() : null,
        defaultDurationMonths:
          durationStr && durationStr.trim() !== '' ? parseInt(durationStr, 10) : null,
        deliveryStatusRequired: form.get('deliveryStatusRequired') === 'on',
      })

      if (!result.ok) {
        setError(result.error.message)
      } else {
        setOpen(false)
      }
      setLoading(false)
    }

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">Novo benefício</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar benefício comercial</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label htmlFor="benefit-brand">Marca</Label>
              <select
                id="benefit-brand"
                name="brandId"
                required
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                aria-required="true"
              >
                <option value="">Selecione uma marca</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="benefit-name">Nome</Label>
              <Input
                id="benefit-name"
                name="name"
                required
                placeholder="Grupo VIP de Suporte"
                aria-required="true"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="benefit-slug">Slug</Label>
              <Input
                id="benefit-slug"
                name="slug"
                required
                placeholder="grupo-vip-suporte"
                pattern="^[a-z0-9][a-z0-9-]*$"
                aria-required="true"
                aria-describedby="benefit-slug-hint"
              />
              <p id="benefit-slug-hint" className="text-xs text-slate-400">
                Somente letras minúsculas, números e hífens.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="benefit-description">Descrição (opcional)</Label>
              <textarea
                id="benefit-description"
                name="description"
                rows={2}
                placeholder="Descreva o benefício..."
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 resize-none"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="benefit-auto-tag">Tag automática (opcional)</Label>
              <Input
                id="benefit-auto-tag"
                name="autoTag"
                placeholder="vip-suporte"
                pattern="^[a-z0-9][a-z0-9-]*$"
                aria-describedby="benefit-tag-hint"
              />
              <p id="benefit-tag-hint" className="text-xs text-slate-400">
                Tag aplicada ao contato ao aprovar transação com este benefício. Kebab-case.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="benefit-duration">Vigência padrão (meses, opcional)</Label>
              <Input
                id="benefit-duration"
                name="defaultDurationMonths"
                type="number"
                min="1"
                placeholder="12"
                aria-describedby="benefit-duration-hint"
              />
              <p id="benefit-duration-hint" className="text-xs text-slate-400">
                Deixe em branco para vigência perpétua.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="benefit-delivery-required"
                name="deliveryStatusRequired"
                className="h-4 w-4 rounded border-slate-300 accent-slate-700"
              />
              <Label htmlFor="benefit-delivery-required" className="cursor-pointer">
                Exigir confirmação de entrega
              </Label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Criando...' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    )
  }

  // ---- Archive benefit confirmation ----
  async function handleArchive() {
    setLoading(true)
    setError(null)

    const result = await archiveBenefitAction({ benefitId })

    if (!result.ok) {
      setError(result.error.message)
    } else {
      setOpen(false)
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="text-slate-500 hover:text-red-600 hover:border-red-300"
          aria-label={`Arquivar benefício ${benefitName}`}
        >
          Arquivar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arquivar benefício</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-slate-600">
            Tem certeza que deseja arquivar o benefício{' '}
            <span className="font-semibold">{benefitName}</span>? Ele não poderá ser incluído
            em novas condições de oferta.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchive}
              disabled={loading}
            >
              {loading ? 'Arquivando...' : 'Arquivar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

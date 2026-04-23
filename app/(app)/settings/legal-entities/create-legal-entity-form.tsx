'use client'

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
import { createLegalEntity } from './actions'

type BrandOption = {
  id: string
  name: string
  slug: string
}

interface CreateLegalEntityFormProps {
  brands: BrandOption[]
}

export function CreateLegalEntityForm({ brands }: CreateLegalEntityFormProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const result = await createLegalEntity({
      cnpj: form.get('cnpj'),
      companyName: form.get('companyName'),
      tradeName: form.get('tradeName') || undefined,
      brandId: form.get('brandId'),
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
        <Button size="sm">Novo CNPJ</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar entidade fiscal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="le-cnpj">CNPJ</Label>
            <Input
              id="le-cnpj"
              name="cnpj"
              required
              placeholder="00000000000100"
              maxLength={14}
              pattern="\d{14}"
              aria-required="true"
              aria-describedby="le-cnpj-hint"
            />
            <p id="le-cnpj-hint" className="text-xs text-slate-400">
              Somente 14 dígitos numéricos, sem pontuação.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="le-company-name">Razão social</Label>
            <Input
              id="le-company-name"
              name="companyName"
              required
              placeholder="CNE Educação Ltda."
              aria-required="true"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="le-trade-name">Nome fantasia (opcional)</Label>
            <Input
              id="le-trade-name"
              name="tradeName"
              placeholder="CNE Carreiras"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="le-brand">Marca associada</Label>
            <select
              id="le-brand"
              name="brandId"
              required
              aria-required="true"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Selecione uma marca</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {brands.length === 0 && (
              <p className="text-xs text-amber-600">
                Nenhuma marca cadastrada. Crie uma marca antes de adicionar um CNPJ.
              </p>
            )}
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
            <Button type="submit" disabled={loading || brands.length === 0}>
              {loading ? 'Cadastrando...' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

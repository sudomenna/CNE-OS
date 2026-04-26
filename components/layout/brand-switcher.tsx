'use client'

import { useEffect, useState } from 'react'
import { Building2, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { listBrandsForSwitcher } from '@/app/(app)/brands/actions'

type BrandOption = { id: string; name: string }

const COOKIE_NAME = 'cne_brand_id'
const COOKIE_MAX_AGE = 31536000

function readBrandCookie(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${COOKIE_NAME}=`))
  return match ? decodeURIComponent(match.split('=')[1]!) : ''
}

function writeBrandCookie(value: string): void {
  const encoded = encodeURIComponent(value)
  document.cookie = `${COOKIE_NAME}=${encoded}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`
}

export function BrandSwitcher() {
  const [brands, setBrands] = useState<BrandOption[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await listBrandsForSwitcher()
      if (cancelled) return

      const list: BrandOption[] = result.ok ? result.data : []
      setBrands(list)

      // Lê cookie somente client-side para evitar hidratação inconsistente
      const cookieValue = readBrandCookie()
      const isValid = cookieValue === '' || list.some((b) => b.id === cookieValue)
      setSelectedId(isValid ? cookieValue : '')
      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  function handleSelect(id: string) {
    setSelectedId(id)
    writeBrandCookie(id)
  }

  const selectedBrand = brands.find((b) => b.id === selectedId)
  const label = selectedBrand ? selectedBrand.name : 'Todas'

  if (loading) {
    return (
      <Skeleton
        className="h-8 w-32 rounded-md"
        aria-label="Carregando marcas..."
      />
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-sm font-normal"
          aria-label={`Marca selecionada: ${label}. Clique para trocar.`}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-[120px] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuItem
          onSelect={() => handleSelect('')}
          aria-selected={selectedId === ''}
          className={selectedId === '' ? 'font-medium' : ''}
        >
          Todas as marcas
        </DropdownMenuItem>

        {brands.length > 0 && <DropdownMenuSeparator />}

        {brands.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onSelect={() => handleSelect(b.id)}
            aria-selected={selectedId === b.id}
            className={selectedId === b.id ? 'font-medium' : ''}
          >
            {b.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

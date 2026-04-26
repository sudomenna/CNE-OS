import Link from 'next/link'
import { Box, FolderOpen, Gift } from 'lucide-react'

export const metadata = {
  title: 'Catálogo',
}

const SECTIONS = [
  {
    href: '/settings/catalog/products',
    label: 'Produtos',
    description: 'Gerencie o catálogo de produtos por marca',
    icon: Box,
  },
  {
    href: '/settings/catalog/categories',
    label: 'Categorias',
    description: 'Organize produtos em categorias hierárquicas',
    icon: FolderOpen,
  },
  {
    href: '/settings/catalog/benefits',
    label: 'Benefícios comerciais',
    description: 'Benefícios e entregáveis das ofertas',
    icon: Gift,
  },
]

export default function CatalogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Catálogo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Produtos, categorias e benefícios comerciais por marca.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {SECTIONS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href as never}
            className="rounded-lg border border-border bg-card p-6 hover:border-border hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${label}: ${description}`}
          >
            <Icon className="h-6 w-6 text-muted-foreground/60 mb-3" aria-hidden="true" />
            <h2 className="font-semibold text-foreground">{label}</h2>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

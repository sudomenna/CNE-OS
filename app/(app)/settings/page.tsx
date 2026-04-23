import Link from 'next/link'
import { Building2, FileText, Users } from 'lucide-react'

export const metadata = {
  title: 'Configurações',
}

const SECTIONS = [
  {
    href: '/settings/brands',
    label: 'Marcas',
    description: 'Gerencie as marcas da CNE Educação',
    icon: Building2,
  },
  {
    href: '/settings/legal-entities',
    label: 'CNPJs',
    description: 'Entidades fiscais e emissão de notas',
    icon: FileText,
  },
  {
    href: '/settings/users',
    label: 'Usuários',
    description: 'Convide e gerencie usuários internos',
    icon: Users,
  },
] as const

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gerencie a organização, entidades fiscais e usuários.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {SECTIONS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-300 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            aria-label={`${label}: ${description}`}
          >
            <Icon className="h-6 w-6 text-slate-400 mb-3" aria-hidden="true" />
            <h2 className="font-semibold text-slate-900">{label}</h2>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

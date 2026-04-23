'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Users, Settings, MessageSquare, Tag, BarChart2, Zap } from 'lucide-react'

type Command = {
  label: string
  href: Route
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
}

const COMMANDS: Command[] = [
  { label: 'Contatos', href: '/contacts', icon: Users },
  { label: 'Inbox', href: '/inbox', icon: MessageSquare },
  { label: 'Ofertas', href: '/offers', icon: Tag },
  { label: 'Campanhas', href: '/campaigns', icon: BarChart2 },
  { label: 'Automações', href: '/automations', icon: Zap },
  { label: 'Configurações', href: '/settings', icon: Settings },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const navigate = (href: Route) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar ou navegar..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          {COMMANDS.map(({ label, href, icon: Icon }) => (
            <CommandItem key={href} onSelect={() => navigate(href)}>
              <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

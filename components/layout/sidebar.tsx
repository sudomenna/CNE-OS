import Link from 'next/link'
import type { Route } from 'next'
import { Users, Settings, BarChart2, MessageSquare, Tag, Zap } from 'lucide-react'

type NavItem = {
  href: Route
  label: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
}

const NAV_ITEMS: NavItem[] = [
  { href: '/contacts', label: 'Contatos', icon: Users },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/offers', label: 'Ofertas', icon: Tag },
  { href: '/campaigns', label: 'Campanhas', icon: BarChart2 },
  { href: '/automations', label: 'Automações', icon: Zap },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-background">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-lg font-bold text-foreground">CNE-OS</span>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Navegação principal">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}

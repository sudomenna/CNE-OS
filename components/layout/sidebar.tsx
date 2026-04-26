import Link from 'next/link'
import type { Route } from 'next'
import {
  Users,
  Settings,
  BarChart2,
  MessageSquare,
  Tag,
  Zap,
  GitBranch,
  LifeBuoy,
  CreditCard,
  Receipt,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getUnreadInboxCount } from '@/app/(app)/inbox/actions'

type NavItem = {
  href: Route
  label: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
}

const OPERATIONAL_ITEMS: NavItem[] = [
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/contacts', label: 'Contatos', icon: Users },
  { href: '/funnels', label: 'Funis', icon: GitBranch },
  { href: '/tickets', label: 'Tickets', icon: LifeBuoy },
  { href: '/transactions', label: 'Transações', icon: CreditCard },
  { href: '/campaigns', label: 'Campanhas', icon: BarChart2 },
  { href: '/offers', label: 'Ofertas', icon: Tag },
  { href: '/automations', label: 'Automações', icon: Zap },
]

const ANALYTIC_CONFIG_ITEMS: NavItem[] = [
  { href: '/analytics', label: 'Dashboards', icon: BarChart2 },
  { href: '/billing/subscriptions', label: 'Cobrança', icon: Receipt },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

const NAV_LINK_CLASS =
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export async function Sidebar() {
  const inboxCount = await getUnreadInboxCount()

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-background">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-lg font-bold text-foreground">CNE-OS</span>
      </div>
      <nav className="flex-1 p-3" aria-label="Navegação principal">
        {/* Grupo operacional */}
        <div className="space-y-1">
          {OPERATIONAL_ITEMS.map(({ href, label, icon: Icon }) => {
            const isInbox = href === '/inbox'
            return (
              <Link key={href} href={href} className={NAV_LINK_CLASS}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {isInbox && inboxCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-auto h-5 min-w-5 justify-center px-1 text-xs"
                    aria-label={`${inboxCount} conversas abertas`}
                  >
                    {inboxCount}
                  </Badge>
                )}
              </Link>
            )
          })}
        </div>

        {/* Separador entre grupo operacional e analítico/config */}
        <Separator className="my-2" />

        {/* Grupo analítico/configuração */}
        <div className="space-y-1">
          {ANALYTIC_CONFIG_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={NAV_LINK_CLASS}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </aside>
  )
}

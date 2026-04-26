import { BrandSwitcher } from '@/components/layout/brand-switcher'
import { NotificationCenter } from '@/components/layout/notification-center'
import { AvatarDropdown } from '@/components/layout/avatar-dropdown'

export type TopbarProps = {
  userName: string
  userEmail: string
  avatarUrl: string | null
}

export function Topbar({ userName, userEmail, avatarUrl }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div />
      <div className="flex items-center gap-3">
        <kbd
          className="hidden rounded border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex"
          aria-label="Atalho para abrir paleta de comandos: Command K"
        >
          ⌘K
        </kbd>
        <BrandSwitcher />
        <NotificationCenter />
        <AvatarDropdown userName={userName} userEmail={userEmail} avatarUrl={avatarUrl ?? null} />
      </div>
    </header>
  )
}
